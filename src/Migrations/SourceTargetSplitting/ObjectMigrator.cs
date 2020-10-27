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
    using SIL.XForge.Models;
    using SIL.XForge.Realtime;
    using SIL.XForge.Realtime.Json0;
    using SIL.XForge.Scripture.Models;
    using SIL.XForge.Scripture.Services;
    using SIL.XForge.Services;
    using SIL.XForge.Utils;

    /// <summary>
    /// The object migrator implementation.
    /// </summary>
    /// <seealso cref="SourceTargetSplitting.IObjectMigrator" />
    public class ObjectMigrator : IObjectMigrator
    {
        /// <summary>
        /// The Mongo database.
        /// </summary>
        private readonly IMongoDatabase _database;

        /// <summary>
        /// The paratext service.
        /// </summary>
        private readonly IParatextService _paratextService;

        /// <summary>
        /// The project secrets repository.
        /// </summary>
        private readonly IRepository<SFProjectSecret> _projectSecrets;

        /// <summary>
        /// The realtime service.
        /// </summary>
        private readonly IRealtimeService _realtimeService;

        /// <summary>
        /// The user secrets repository.
        /// </summary>
        private readonly IRepository<UserSecret> _userSecrets;

        /// <summary>
        /// Initializes a new instance of the <see cref="ObjectMigrator" /> class.
        /// </summary>
        /// <param name="dataAccessOptions">The data access options.</param>
        /// <param name="mongoClient">The mongo client.</param>
        /// <param name="paratextService">The paratext service.</param>
        /// <param name="projectSecrets">The project secrets repository.</param>
        /// <param name="realtimeService">The realtime service.</param>
        /// <param name="userSecrets">The user secrets repository.</param>
        public ObjectMigrator(
            IOptions<DataAccessOptions> dataAccessOptions,
            IMongoClient mongoClient,
            IParatextService paratextService,
            IRepository<SFProjectSecret> projectSecrets,
            IRealtimeService realtimeService,
            IRepository<UserSecret> userSecrets)
        {
            this._database = mongoClient.GetDatabase(dataAccessOptions.Value.MongoDatabaseName);
            this._paratextService = paratextService;
            this._projectSecrets = projectSecrets;
            this._realtimeService = realtimeService;
            this._userSecrets = userSecrets;
        }

        /// <inheritdoc />
        public async Task CreateProjectFromResourceAsync(string resourceId, string targetId)
        {
            // Get the administrator for the specified project
            var targetProject = this._realtimeService.QuerySnapshots<SFProject>().FirstOrDefault(p => p.ParatextId == targetId);
            if (targetProject == null)
            {
                throw new DataNotFoundException("The target project does not exist");
            }

            // Get the highest ranked for this project, that probably has source access
            string userId = targetProject.UserRoles
                .Where(ur => ur.Value == SFProjectRole.Administrator || ur.Value == SFProjectRole.Translator)
                .OrderBy(ur => ur.Value)
                .FirstOrDefault().Key;

            // Get the user secret for the user
            Attempt<UserSecret> userSecretAttempt = await this._userSecrets.TryGetAsync(userId);
            if (!userSecretAttempt.TryResult(out UserSecret userSecret))
            {
                throw new DataNotFoundException("The user does not exist.");
            }

            // We check projects first, in case it is a project, but also because this will refresh the token for us
            IReadOnlyList<ParatextProject> projects = await this._paratextService.GetProjectsAsync(userSecret).ConfigureAwait(false);
            ParatextProject resource = projects.SingleOrDefault(r => r.ParatextId == resourceId);
            if (resource == null)
            {
                // Otherwise, see if this is a resource
                projects = this._paratextService.GetResources(userSecret);
                resource = projects.SingleOrDefault(r => r.ParatextId == resourceId);
                if (resource == null)
                {
                    throw new DataNotFoundException("The source paratext project does not exist.");
                }
            }

            var project = new SFProject
            {
                ParatextId = resourceId,
                Name = resource.Name,
                ShortName = resource.ShortName,
                WritingSystem = new WritingSystem { Tag = resource.LanguageTag },
                TranslateConfig = new TranslateConfig
                {
                    TranslationSuggestionsEnabled = false,
                    Source = null
                },
                CheckingConfig = new CheckingConfig
                {
                    CheckingEnabled = false
                }
            };

            // Connect to the realtime service
            using IConnection connection = await this._realtimeService.ConnectAsync().ConfigureAwait(false);

            // Create the new project using the realtime service
            string projectId = ObjectId.GenerateNewId().ToString();
            IDocument<SFProject> projectDoc = await connection.CreateAsync(projectId, project);
            await this._projectSecrets.InsertAsync(new SFProjectSecret { Id = projectDoc.Id }).ConfigureAwait(false);
        }

        /// <inheritdoc />
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
                        Program.Log($"Project {sourceParatextId} is missing from MongoDB!");
                    }
                }
            }

            // Get the existing textdata objects from MongoDB
            List<TextData> texts = this._realtimeService.QuerySnapshots<TextData>().ToList();

            // Iterate over every text in database
            foreach (TextData text in texts)
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
            IMongoCollection<BsonDocument> snapshotCollection = this._database.GetCollection<BsonDocument>(collectionName);
            FilterDefinition<BsonDocument> idFilter = Builders<BsonDocument>.Filter.Regex("_id", $"^{id}");
            await snapshotCollection.DeleteManyAsync(idFilter).ConfigureAwait(false);

            IMongoCollection<BsonDocument> opsCollection = this._database.GetCollection<BsonDocument>($"o_{collectionName}");
            FilterDefinition<BsonDocument> dFilter = Builders<BsonDocument>.Filter.Regex("d", $"^{id}");
            await opsCollection.DeleteManyAsync(dFilter).ConfigureAwait(false);
        }
    }
}
