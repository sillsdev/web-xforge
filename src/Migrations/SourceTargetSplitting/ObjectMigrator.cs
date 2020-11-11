namespace SourceTargetSplitting
{
    using System;
    using System.Collections.Generic;
    using System.Linq;
    using System.Threading.Tasks;
    using Microsoft.Extensions.Options;
    using MongoDB.Bson;
    using MongoDB.Driver;
    using SIL.XForge.Configuration;
    using SIL.XForge.DataAccess;
    using SIL.XForge.Realtime;
    using SIL.XForge.Realtime.Json0;
    using SIL.XForge.Scripture.Models;
    using SIL.XForge.Scripture.Services;
    using SIL.XForge.Services;

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
        /// The project service.
        /// </summary>
        private readonly ISFProjectService _projectService;

        /// <summary>
        /// The realtime service.
        /// </summary>
        private readonly IRealtimeService _realtimeService;

        /// <summary>
        /// Initializes a new instance of the <see cref="ObjectMigrator" /> class.
        /// </summary>
        /// <param name="dataAccessOptions">The data access options.</param>
        /// <param name="mongoClient">The mongo client.</param>
        /// <param name="projectService">The project service.</param>
        /// <param name="realtimeService">The realtime service.</param>
        public ObjectMigrator(
            IOptions<DataAccessOptions> dataAccessOptions,
            IMongoClient mongoClient,
            ISFProjectService projectService,
            IRealtimeService realtimeService)
        {
            this._database = mongoClient.GetDatabase(dataAccessOptions.Value.MongoDatabaseName);
            this._projectService = projectService;
            this._realtimeService = realtimeService;
        }

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
            foreach (string userId in userIds)
            {
                try
                {
                    // Use the project service to create the resource project
                    string sourceProjectRef =
                        await this._projectService.CreateResourceProjectAsync(userId, sourceId).ConfigureAwait(false);

                    // Add each user in the target project to the source project so they can access it
                    foreach (string uid in userIds)
                    {
                        if (sourceId.Length == SFInstallableDBLResource.ResourceIdentifierLength)
                        {
                            // Add the user to the resource
                            await this._projectService.AddUserToResourceProjectAsync(uid, sourceProjectRef);
                        }
                        else
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
                    }

                    // Successfully created
                    break;
                }
                catch (DataNotFoundException)
                {
                    // We don't have access
                    continue;
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
            IMongoCollection<TextData> collection = _database.GetCollection<TextData>(collectionName);

            // Get the existing textdata object ids from MongoDB
            List<string> textIds = collection.AsQueryable().Select(t => t.Id).ToList();
            List<string> sourceTextIds = textIds.Where(t => t.EndsWith(":source", StringComparison.Ordinal)).ToList();

            // Iterate over every text id in database
            foreach (string textId in sourceTextIds)
            {
                // Get the TextData from the database
                TextData? text = await collection
                    .Find(Builders<TextData>.Filter.Eq("_id", textId))
                    .SingleOrDefaultAsync()
                    .ConfigureAwait(false);
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
                                    await oldTextDoc.FetchAsync().ConfigureAwait(false);
                                    if (oldTextDoc.IsLoaded)
                                    {
                                        await oldTextDoc.DeleteAsync().ConfigureAwait(false);
                                    }

                                    // Remove from MongoDB
                                    await this.DeleteDocsAsync("texts", oldId).ConfigureAwait(false);

                                    // Add the new text document via the real time service
                                    await connection.CreateAsync(text.Id, text).ConfigureAwait(false);
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
                                    await oldTextDoc.FetchAsync().ConfigureAwait(false);
                                    if (oldTextDoc.IsLoaded)
                                    {
                                        await oldTextDoc.DeleteAsync().ConfigureAwait(false);
                                    }

                                    // Remove from MongoDB
                                    await this.DeleteDocsAsync("texts", oldId).ConfigureAwait(false);
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

            // Iterate through the users until we find someone with access
            foreach (string userId in userIds)
            {
                try
                {
                    // Add each user in the target project to the source project so they can access it
                    foreach (string uid in userIds)
                    {
                        if (sourceId.Length == SFInstallableDBLResource.ResourceIdentifierLength)
                        {
                            // Add the user to the resource
                            await this._projectService.AddUserToResourceProjectAsync(uid, sourceProject.Id);
                        }
                        else
                        {
                            try
                            {
                                // Add the user to the project
                                await this._projectService.AddUserAsync(uid, sourceProject.Id, null);
                            }
                            catch (ForbiddenException)
                            {
                                // The user does not have Paratext access
                            }
                        }
                    }

                    // Successfully created
                    break;
                }
                catch (DataNotFoundException)
                {
                    // We don't have access
                    continue;
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
            await snapshotCollection.DeleteManyAsync(idFilter).ConfigureAwait(false);

            IMongoCollection<BsonDocument> opsCollection =
                this._database.GetCollection<BsonDocument>($"o_{collectionName}");
            FilterDefinition<BsonDocument> dFilter = Builders<BsonDocument>.Filter.Regex("d", $"^{id}");
            await opsCollection.DeleteManyAsync(dFilter).ConfigureAwait(false);
        }
    }
}
