namespace SourceTargetSplitting
{
    using System;
    using System.Collections.Generic;
    using System.Linq;
    using System.Threading.Tasks;
    using System.Xml.Linq;
    using Microsoft.Extensions.Options;
    using MongoDB.Bson;
    using MongoDB.Driver;
    using Paratext.Data;
    using SIL.XForge.Configuration;
    using SIL.XForge.DataAccess;
    using SIL.XForge.Models;
    using SIL.XForge.Realtime;
    using SIL.XForge.Realtime.Json0;
    using SIL.XForge.Realtime.RichText;
    using SIL.XForge.Scripture.Models;
    using SIL.XForge.Scripture.Services;
    using SIL.XForge.Services;
    using SIL.XForge.Utils;

    /// <summary>
    /// The object migrator.
    /// </summary>
    public class ObjectMigrator
    {
        /// <summary>
        /// The Mongo database.
        /// </summary>
        private readonly IMongoDatabase _database;

        /// <summary>
        /// The delta USX mapper.
        /// </summary>
        private readonly IDeltaUsxMapper _deltaUsxMapper;

        /// <summary>
        /// The paratext service.
        /// </summary>
        private readonly IParatextService _paratextService;

        /// <summary>
        /// The project service.
        /// </summary>
        private readonly ISFProjectService _projectService;

        /// <summary>
        /// The realtime service.
        /// </summary>
        private readonly IRealtimeService _realtimeService;

        /// <summary>
        /// The user secrets repository.
        /// </summary>
        private readonly IRepository<UserSecret> _userSecrets;

        /// <summary>
        /// A collection of test projects, only used to ensure that there is a source project created when testing.
        /// </summary>
        private readonly List<SFProject> _testProjectCollection = new List<SFProject>();

        /// <summary>
        /// A collection of test text data ids, used to make the text data migration more accurate in test mode.
        /// </summary>
        private readonly List<string> _testTextDataIdCollection = new List<string>();

        /// <summary>
        /// Initializes a new instance of the <see cref="ObjectMigrator" /> class.
        /// </summary>
        /// <param name="dataAccessOptions">The data access options.</param>
        /// <param name="deltaUsxMapper">The delta USX mapper.</param>
        /// <param name="mongoClient">The mongo client.</param>
        /// <param name="paratextService">The paratext service.</param>
        /// <param name="projectService">The project service.</param>
        /// <param name="realtimeService">The realtime service.</param>
        /// <param name="userSecrets">The user secrets repository.</param>
        public ObjectMigrator(
            IOptions<DataAccessOptions> dataAccessOptions,
             IDeltaUsxMapper deltaUsxMapper,
            IMongoClient mongoClient,
            IParatextService paratextService,
            ISFProjectService projectService,
            IRealtimeService realtimeService,
            IRepository<UserSecret> userSecrets)
        {
            this._database = mongoClient.GetDatabase(dataAccessOptions.Value.MongoDatabaseName);
            this._deltaUsxMapper = deltaUsxMapper;
            this._paratextService = paratextService;
            this._projectService = projectService;
            this._realtimeService = realtimeService;
            this._userSecrets = userSecrets;
        }

        /// <summary>
        /// Gets the source scripture text collection.
        /// </summary>
        /// <value>
        /// The source scripture text collection.
        /// </value>
        /// <remarks>
        /// This is only used for testing.
        /// </remarks>
        internal SourceScrTextCollection SourceScrTextCollection { get; } = new SourceScrTextCollection();

        /// <summary>
        /// Gets the target scripture text collection.
        /// </summary>
        /// <value>
        /// The target scripture text collection.
        /// </value>
        internal LazyScrTextCollection TargetScrTextCollection { get; } = new LazyScrTextCollection();

        /// <summary>
        /// Creates the project from a source project reference.
        /// </summary>
        /// <param name="sourceId">The source project/resource identifier.</param>
        /// <param name="targetId">The target project identifier.
        /// This is the project that will reference this project/resource a source.</param>
        /// <returns>
        /// The task.
        /// </returns>
        public async Task CreateProjectFromSourceAsync(string sourceId, string targetId)
        {
            // Get the administrator for the specified project
            var targetProject =
                this._realtimeService.QuerySnapshots<SFProject>().FirstOrDefault(p => p.ParatextId == targetId);
            if (targetProject == null)
            {
                throw new DataNotFoundException("The target project does not exist");
            }

            // Get the highest ranked for this project, that probably has source access
            string[] userIds = targetProject.UserRoles
                .Where(ur => ur.Value == SFProjectRole.Administrator || ur.Value == SFProjectRole.Translator)
                .OrderBy(ur => ur.Value)
                .Select(ur => ur.Key)
                .ToArray();

            // Iterate through the users until we find someone with access
            string sourceProjectRef = string.Empty;
            string curUserId = string.Empty;
            foreach (string userId in userIds)
            {
                try
                {
                    // Use the project service to create the resource project
                    sourceProjectRef =
                        await this._projectService.CreateResourceProjectAsync(userId, sourceId);

                    // Add each user in the target project to the source project so they can access it
                    foreach (string uid in userIds)
                    {
                        try
                        {
                            // Add the user to the project
                            await this._projectService.AddUserAsync(uid, sourceProjectRef, null);
                        }
                        catch (ForbiddenException)
                        {
                            // The user does not have Paratext access
                        }
                    }

                    // Successfully created
                    curUserId = userId;
                    break;
                }
                catch (DataNotFoundException)
                {
                    // We don't have access
                    continue;
                }
                catch (InvalidOperationException)
                {
                    // Project already exists
                    break;
                }
            }

            // Next, recreate the books, if we have a project reference
            if (!string.IsNullOrWhiteSpace(sourceProjectRef))
            {
                // Get the user secret
                Attempt<UserSecret> userSecretAttempt = await this._userSecrets.TryGetAsync(curUserId);
                if (!userSecretAttempt.TryResult(out UserSecret userSecret))
                {
                    throw new DataNotFoundException("The user secret does not exist.");
                }

                // Connect to the realtime service
                using IConnection connection = await this._realtimeService.ConnectAsync();

                // Get the project
                IDocument<SFProject>? projectDoc =
                    await connection.FetchAsync<SFProject>(sourceProjectRef);
                if (!projectDoc.IsLoaded)
                    return;

                // Add all of the books
                foreach (int bookNum in this._paratextService.GetBookList(userSecret, sourceId))
                {
                    Dictionary<string, string>? permissions =
                        await this._paratextService.GetPermissionsAsync(userSecret, projectDoc.Data, bookNum);

                    TextInfo text = new TextInfo
                    {
                        BookNum = bookNum,
                        HasSource = false,
                        Permissions = permissions,
                    };

                    List<Chapter> newChapters =
                        await this.UpdateTextDocsAsync(userSecret, text, sourceProjectRef, sourceId, connection);

                    // Update project with new TextInfo
                    await projectDoc.SubmitJson0OpAsync(op =>
                    {
                        text.Chapters = newChapters;
                        op.Add(pd => pd.Texts, text);
                    });
                }
            }
        }

        /// <summary>
        /// Migrates the objects.
        /// </summary>
        /// <param name="doWrite">If set to <c>true</c>, do write changes to the database.</param>
        /// <returns>
        /// The task.
        /// </returns>
        public async Task MigrateObjectsAsync(bool doWrite)
        {
            // Get the existing projects from MongoDB
            List<SFProject> existingProjects = this._realtimeService.QuerySnapshots<SFProject>().ToList();

            // If we are testing, add the test projects
            if (!doWrite)
            {
                existingProjects.AddRange(this._testProjectCollection);
            }

            // This is the mapping for update the TextData identifiers
            // The key is the target project id, the value is the new source project id
            Dictionary<string, string> sourceMapping = new Dictionary<string, string>();

            // Connect to the realtime service
            using IConnection connection = await this._realtimeService.ConnectAsync();

            // Iterate over every project in database
            foreach (var project in existingProjects)
            {
                // Update ProjectRef value
                string? sourceParatextId = project.TranslateConfig?.Source?.ParatextId;
                if (!string.IsNullOrWhiteSpace(sourceParatextId))
                {
                    // Get the source project
                    SFProject sourceProject = existingProjects.FirstOrDefault(p => p.ParatextId == sourceParatextId);
                    if (sourceProject != null)
                    {
                        // Update the database
                        Program.Log($"Project {project.Id} $.TranslateConfig.Source.ProjectRef = '{sourceProject.Id}'");
                        if (doWrite)
                        {
                            // Set the ProjectRef
                            var projectDoc = await connection.FetchAsync<SFProject>(project.Id);
                            await projectDoc.SubmitJson0OpAsync(op =>
                            {
                                op.Set(p => p.TranslateConfig.Source.ProjectRef, sourceProject.Id);
                            });
                        }

                        // Record the source mapping
                        sourceMapping.Add(project.Id, sourceProject.Id);
                    }
                    else
                    {
                        Program.Log($"Error Migrating {project.Id} - Source {sourceParatextId} is missing from MongoDB!");
                    }
                }
            }

            // Get the Textdata collection
            string collectionName = this._realtimeService.GetCollectionName<TextData>();
            IMongoCollection<TextData> collection = this._database.GetCollection<TextData>(collectionName);

            // Get the existing textdata object ids from MongoDB
            List<string> textIds = collection.AsQueryable().Select(t => t.Id).ToList();
            if (!doWrite)
            {
                // Add the test text ids, if we are testing
                textIds = textIds.Concat(this._testTextDataIdCollection).Distinct().ToList();
            }

            List<string> sourceTextIds = textIds.Where(t => t.EndsWith(":source", StringComparison.Ordinal)).ToList();

            // Iterate over every text id in database
            foreach (string textId in sourceTextIds)
            {
                // Get the TextData from the database
                TextData? text = await collection
                    .Find(Builders<TextData>.Filter.Eq("_id", textId))
                    .SingleOrDefaultAsync();

                // If we are testing, see if we have an id in the our test collection
                if (!doWrite && text == null && this._testTextDataIdCollection.Contains(textId))
                {
                    // Build a hollow text data object for test purposes
                    text = new TextData() { Id = textId };
                }

                // If we have the specified id in the database
                if (text != null)
                {
                    // Create with new _id for source text, deleting the old one
                    // You cannot rename _id's, and the client will download a new object with the new id anyway
                    string oldId = text.Id;
                    string[] textIdParts = oldId.Split(':', StringSplitOptions.RemoveEmptyEntries);
                    if (textIdParts.Length == 4 && textIdParts.Last() == "source")
                    {
                        string targetId = textIdParts.First();
                        if (sourceMapping.ContainsKey(targetId))
                        {
                            text.Id = $"{sourceMapping[targetId]}:{textIdParts[1]}:{textIdParts[2]}:target";
                            if (!textIds.Contains(text.Id))
                            {
                                textIds.Add(text.Id);
                                Program.Log($"Rename TextData {oldId} to {text.Id}");
                                if (doWrite)
                                {
                                    // NOTE: You cannot rename _id in MongoDB!

                                    // Delete from ShareDB
                                    IDocument<TextData> oldTextDoc = connection.Get<TextData>(oldId);
                                    await oldTextDoc.FetchAsync();
                                    if (oldTextDoc.IsLoaded)
                                    {
                                        await oldTextDoc.DeleteAsync();
                                    }

                                    // Remove from MongoDB
                                    await this.DeleteDocsAsync("texts", oldId);

                                    // Add the new text document via the real time service
                                    await connection.CreateAsync(text.Id, text);
                                }
                            }
                            else
                            {
                                // Remove the source, as the it already exists as a target
                                Program.Log($"TextData {text.Id} already exists, deleting {oldId}");
                                if (doWrite)
                                {
                                    // Delete from ShareDB
                                    IDocument<TextData> oldTextDoc = connection.Get<TextData>(oldId);
                                    await oldTextDoc.FetchAsync();
                                    if (oldTextDoc.IsLoaded)
                                    {
                                        await oldTextDoc.DeleteAsync();
                                    }

                                    // Remove from MongoDB
                                    await this.DeleteDocsAsync("texts", oldId);
                                }
                            }
                        }
                        else
                        {
                            Program.Log($"Error Migrating TextData {text.Id} - Missing Source Mapping");
                        }
                    }
                    else
                    {
                        Program.Log($"Error Migrating TextData {text.Id} - Incorrect Identifier Format");
                    }
                }
                else
                {
                    Program.Log($"Error Migrating TextData {textId} - Could Not Load From MongoDB");
                }
            }
        }

        /// <summary>
        /// Migrates the chapter and book permissions for all projects.
        /// </summary>
        /// <param name="doWrite">If set to <c>true</c>, do write changes to the database.</param>
        public async Task MigrateChapterAndBookPermissions(bool doWrite)
        {
            // Get the existing projects from MongoDB
            List<SFProject> existingProjects = await this._realtimeService.QuerySnapshots<SFProject>().ToListAsync();

            // If we are testing, add the test projects
            if (!doWrite)
            {
                existingProjects.AddRange(this._testProjectCollection);
            }

            // Get every user id and username from the user secrets
            Dictionary<string, string> userMapping = await this._userSecrets.Query()
                .ToDictionaryAsync(u => u.Id, u => this._paratextService.GetParatextUsername(u));

            // Iterate over every project
            foreach (SFProject project in existingProjects)
            {
                // Get the scripture text for the project
                ScrText? scrText = null;
                if (!doWrite && this._testProjectCollection.Contains(project))
                {
                    // If we are in testing, find the original target project to get the source ScrText object
                    SFProject? targetProject =
                        existingProjects.FirstOrDefault(p => p.TranslateConfig.Source.ParatextId == project.ParatextId);
                    if (targetProject != null)
                    {
                        scrText = this.SourceScrTextCollection.FindById("admin", targetProject.ParatextId);
                    }
                    else
                    {
                        Program.Log($"Test Error Migrating Permissions For {project.Id} - Could Not Find Target");
                    }
                }
                else
                {
                    scrText = this.TargetScrTextCollection.FindById("admin", project.ParatextId);
                }

                Program.Log($"Migrating Permissions For {project.Id}...");

                // If we found the scripture text collection, we can migrate permissions.
                if (scrText != null)
                {
                    // Connect to the realtime service
                    using IConnection connection = await this._realtimeService.ConnectAsync();

                    // Get the project
                    IDocument<SFProject>? projectDoc =
                        await connection.FetchAsync<SFProject>(project.Id);
                    if (!projectDoc.IsLoaded)
                        return;

                    // Iterate over every book then every chapter
                    var bookPermissionOperations = new List<(int i, Dictionary<string, string> bookPermissions)>();
                    var chapterPermissionOperations =
                        new List<(int i, int j, Dictionary<string, string> chapterPermissions)>();
                    for (int i = 0; i < project.Texts.Count; i++)
                    {
                        Program.Log($"Migrating Permissions For {project.Id} Book {project.Texts[i].BookNum}...");

                        // Declare the book permissions
                        var bookPermissions = new Dictionary<string, string>();

                        // Calculate the book permissions
                        foreach (string uid in project.UserRoles.Keys)
                        {
                            // See if the user is in the project members list
                            if (!userMapping.TryGetValue(uid, out string? userName)
                                || string.IsNullOrWhiteSpace(userName))
                            {
                                bookPermissions.Add(uid, TextInfoPermission.None);
                            }
                            else
                            {
                                string textInfoPermission = TextInfoPermission.Read;
                                IEnumerable<int> editable = scrText.Permissions.GetEditableBooks(
                                        Paratext.Data.Users.PermissionSet.Merged, userName);
                                if (editable == null || !editable.Any())
                                {
                                    // If there are no editable book permissions, check if they can edit all books
                                    if (scrText.Permissions.CanEditAllBooks(userName))
                                    {
                                        textInfoPermission = TextInfoPermission.Write;
                                    }
                                }
                                else if (editable.Contains(project.Texts[i].BookNum))
                                {
                                    textInfoPermission = TextInfoPermission.Write;
                                }

                                bookPermissions.Add(uid, textInfoPermission);
                            }
                        }

                        // Store the book permissions operation in a tuple
                        bookPermissionOperations.Add((i, bookPermissions));

                        // Iterate over every chapter in the book
                        for (int j = 0; j < project.Texts[i].Chapters.Count; j++)
                        {
                            // Declare the chapter permissions
                            var chapterPermissions = new Dictionary<string, string>();

                            // Calculate the chapter permissions
                            foreach (string uid in project.UserRoles.Keys)
                            {
                                // See if the user is in the project members list
                                if (!userMapping.TryGetValue(uid, out string? userName)
                                    || string.IsNullOrWhiteSpace(userName))
                                {
                                    chapterPermissions.Add(uid, TextInfoPermission.None);
                                }
                                else
                                {
                                    string textInfoPermission = TextInfoPermission.Read;
                                    IEnumerable<int>? editable = scrText.Permissions.GetEditableChapters(
                                        project.Texts[i].BookNum, scrText.Settings.Versification, userName,
                                        Paratext.Data.Users.PermissionSet.Merged);
                                    if (editable?.Contains(project.Texts[i].Chapters[j].Number) ?? false)
                                    {
                                        textInfoPermission = TextInfoPermission.Write;
                                    }

                                    chapterPermissions.Add(uid, textInfoPermission);
                                }
                            }

                            // Store the chapter permissions operation in a tuple
                            chapterPermissionOperations.Add((i, j, chapterPermissions));
                        }
                    }

                    // Write the chapter permissions
                    if (doWrite)
                    {
                        await projectDoc.SubmitJson0OpAsync(op =>
                        {
                            foreach ((int i, Dictionary<string, string> bookPermissions) in bookPermissionOperations)
                            {
                                op.Set(pd => pd.Texts[i].Permissions, bookPermissions);
                            }

                            foreach ((int i, int j, Dictionary<string, string> chapterPermissions) in
                                chapterPermissionOperations)
                            {
                                op.Set(pd => pd.Texts[i].Chapters[j].Permissions, chapterPermissions);
                            }
                        });
                    }
                }
                else if (project.ParatextId.Length == SFInstallableDblResource.ResourceIdentifierLength)
                {
                    Program.Log($"Error Migrating Permissions For {project.Id} - Cannot Migrate A Resource");
                }
                else
                {
                    Program.Log($"Error Migrating Permissions For {project.Id} - Could Not Find ScrText");
                }
            }
        }

        /// <summary>
        /// Migrates a target project's permissions to the source project.
        /// </summary>
        /// <param name="sourceId">The source project/resource identifier.</param>
        /// <param name="targetId">The target project identifier.
        /// This is the project that will reference this project/resource a source.</param>
        /// <returns>
        /// The task.
        /// </returns>
        public async Task MigrateTargetPermissionsAsync(string sourceId, string targetId)
        {
            // Get the target project
            var targetProject =
                this._realtimeService.QuerySnapshots<SFProject>().FirstOrDefault(p => p.ParatextId == targetId);
            if (targetProject == null)
            {
                throw new DataNotFoundException("The target project does not exist");
            }

            // Get the source project
            var sourceProject =
                this._realtimeService.QuerySnapshots<SFProject>().FirstOrDefault(p => p.ParatextId == sourceId);
            if (sourceProject == null)
            {
                throw new DataNotFoundException("The source project does not exist");
            }

            // Get the highest ranked for this project, that probably has source access
            string[] userIds = targetProject.UserRoles
                .Select(ur => ur.Key)
                .Where(u => !sourceProject.UserRoles.Keys.Contains(u))
                .ToArray();

            // Add each user in the target project to the source project so they can access it
            foreach (string userId in userIds)
            {
                try
                {
                    // Add the user to the project
                    await this._projectService.AddUserAsync(userId, sourceProject.Id, null);
                }
                catch (ForbiddenException)
                {
                    // The user does not have Paratext access
                }
            }
        }

        /// <summary>
        /// Creates an internal test project.
        /// </summary>
        /// <param name="sourceId">The source project/resource identifier.</param>
        /// <param name="targetId">The target project identifier.
        /// This is the project that will reference this project/resource a source.</param>
        /// <returns>THe task</returns>
        /// <exception cref="DataNotFoundException">
        /// The target project does not exist
        /// or
        /// The user does not exist.
        /// </exception>
        /// <remarks>
        /// This is only to be used on test runs!
        /// </remarks>
        internal async Task CreateInternalTestProjectAsync(string sourceId, string targetId)
        {
            if (!this._testProjectCollection.Any(p => p.ParatextId == sourceId) && !string.IsNullOrWhiteSpace(sourceId))
            {
                // Create the test project
                SFProject testProject = new SFProject
                {
                    Id = ObjectId.GenerateNewId().ToString(),
                    ParatextId = sourceId,
                };
                this._testProjectCollection.Add(testProject);

                // Load the source project from the target project's source directory (it is not moved in test mode)
                ScrText? scrText = SourceScrTextCollection.FindById("admin", targetId);
                if (scrText != null)
                {
                    // Create the test text objects for all of the books
                    foreach (int bookNum in scrText.Settings.BooksPresentSet.SelectedBookNumbers)
                    {
                        string usfm = scrText.GetText(bookNum);
                        string bookText = UsfmToUsx.ConvertToXmlString(scrText, bookNum, usfm, false);
                        var usxDoc = XDocument.Parse(bookText);
                        Dictionary<int, ChapterDelta> deltas =
                            this._deltaUsxMapper.ToChapterDeltas(usxDoc).ToDictionary(cd => cd.Number);
                        var chapters = new List<Chapter>();
                        foreach (KeyValuePair<int, ChapterDelta> kvp in deltas)
                        {
                            this._testTextDataIdCollection.Add(TextData.GetTextDocId(testProject.Id, bookNum, kvp.Key));
                        }
                    }
                }
                else
                {
                    Program.Log($"Test Mode Error Migrating TextData For {sourceId} - Could Not Load From Filesystem!");
                }

                // See that at least one user in the target project has permission to create the source project
                var targetProject =
                    this._realtimeService.QuerySnapshots<SFProject>().FirstOrDefault(p => p.ParatextId == targetId);
                if (targetProject == null)
                {
                    throw new DataNotFoundException("The target project does not exist");
                }

                // Get the highest ranked users for this project, that probably have source access
                string[] userIds = targetProject.UserRoles
                    .Where(ur => ur.Value == SFProjectRole.Administrator || ur.Value == SFProjectRole.Translator)
                    .OrderBy(ur => ur.Value)
                    .Select(ur => ur.Key)
                    .ToArray();

                bool someoneCanAccessSourceProject = false;
                foreach (string userId in userIds)
                {
                    Attempt<UserSecret> userSecretAttempt = await _userSecrets.TryGetAsync(userId);
                    if (!userSecretAttempt.TryResult(out UserSecret userSecret))
                    {
                        throw new DataNotFoundException("The user does not exist.");
                    }

                    // We check projects first, in case it is a project
                    IReadOnlyList<ParatextProject> ptProjects = await _paratextService.GetProjectsAsync(userSecret);
                    if (ptProjects.Any(p => p.ParatextId == sourceId))
                    {
                        someoneCanAccessSourceProject = true;
                        break;
                    }
                }

                if (!someoneCanAccessSourceProject)
                {
                    Program.Log($"Test Mode Error Creating {sourceId} - Nobody In The Target Project Has Access!");
                }
            }
        }

        /// <summary>
        /// Deletes the document and any versions in the specified collection, matching the specified identifer.
        /// </summary>
        /// <param name="collectionName">Name of the collection.</param>
        /// <param name="id">The identifier.</param>
        private async Task DeleteDocsAsync(string collectionName, string id)
        {
            IMongoCollection<BsonDocument> snapshotCollection =
                this._database.GetCollection<BsonDocument>(collectionName);
            FilterDefinition<BsonDocument> idFilter = Builders<BsonDocument>.Filter.Regex("_id", $"^{id}");
            await snapshotCollection.DeleteManyAsync(idFilter);

            IMongoCollection<BsonDocument> opsCollection =
                this._database.GetCollection<BsonDocument>($"o_{collectionName}");
            FilterDefinition<BsonDocument> dFilter = Builders<BsonDocument>.Filter.Regex("d", $"^{id}");
            await opsCollection.DeleteManyAsync(dFilter);
        }

        /// <summary>
        /// Updates the text documents asynchronously.
        /// </summary>
        /// <param name="userSecret">The user secret.</param>
        /// <param name="text">The text.</param>
        /// <param name="projectId">The project identifier.</param>
        /// <param name="paratextId">The Paratext identifier.</param>
        /// <param name="connection">The connection.</param>
        /// <returns>
        /// The list of chapters for the <see cref="TextInfo" />.
        /// </returns>
        /// <remarks>
        /// This is a heavy modification of <see cref="ParatextSyncRunner.UpdateTextDocsAsync" />, which was not suitable
        /// not only because it is private, but because it updates and removes as well as just adds chapters.
        /// </remarks>
        private async Task<List<Chapter>> UpdateTextDocsAsync(
            UserSecret userSecret,
            TextInfo text,
            string projectId,
            string paratextId,
            IConnection connection)
        {
            string bookText = this._paratextService.GetBookText(userSecret, paratextId, text.BookNum);
            var usxDoc = XDocument.Parse(bookText);
            var tasks = new List<Task>();
            Dictionary<int, ChapterDelta> deltas =
                this._deltaUsxMapper.ToChapterDeltas(usxDoc).ToDictionary(cd => cd.Number);
            var chapters = new List<Chapter>();
            foreach (KeyValuePair<int, ChapterDelta> kvp in deltas)
            {
                var textDataDoc = connection.Get<TextData>(TextData.GetTextDocId(projectId, text.BookNum, kvp.Key));
                async Task createText(int chapterNum, Delta delta)
                {
                    await textDataDoc.FetchAsync();
                    if (textDataDoc.IsLoaded)
                    {
                        await textDataDoc.DeleteAsync();
                    }

                    await textDataDoc.CreateAsync(new TextData(delta));
                }

                tasks.Add(createText(kvp.Key, kvp.Value.Delta));
                chapters.Add(new Chapter
                {
                    Number = kvp.Key,
                    LastVerse = kvp.Value.LastVerse,
                    IsValid = kvp.Value.IsValid
                });
            }

            await Task.WhenAll(tasks);
            return chapters;
        }
    }
}
