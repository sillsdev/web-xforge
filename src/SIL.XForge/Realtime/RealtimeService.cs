using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Humanizer;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Driver;
using SIL.ObjectModel;
using SIL.XForge.Configuration;
using SIL.XForge.Models;

namespace SIL.XForge.Realtime
{
    /// <summary>
    /// This service is responsible for managing the real-time/ShareDB server. It provides methods for accessing
    /// real-time data and performing actions on the server.
    /// </summary>
    public class RealtimeService : DisposableBase, IRealtimeService
    {
        private readonly IOptions<SiteOptions> _siteOptions;
        private readonly IOptions<DataAccessOptions> _dataAccessOptions;
        private readonly IOptions<RealtimeOptions> _realtimeOptions;
        private readonly IOptions<AuthOptions> _authOptions;
        private readonly IMongoDatabase _database;
        private readonly Dictionary<Type, DocConfig> _docConfigs;

        public RealtimeService(RealtimeServer server, IOptions<SiteOptions> siteOptions,
            IOptions<DataAccessOptions> dataAccessOptions, IOptions<RealtimeOptions> realtimeOptions,
            IOptions<AuthOptions> authOptions, IMongoClient mongoClient)
        {
            Server = server;
            _siteOptions = siteOptions;
            _dataAccessOptions = dataAccessOptions;
            _realtimeOptions = realtimeOptions;
            _authOptions = authOptions;
            _database = mongoClient.GetDatabase(_dataAccessOptions.Value.MongoDatabaseName);

            RealtimeOptions options = _realtimeOptions.Value;
            _docConfigs = new Dictionary<Type, DocConfig>();
            foreach (DocConfig projectDataDoc in options.Docs)
                AddDocConfig(projectDataDoc);
        }

        internal RealtimeServer Server { get; }

        public void StartServer()
        {
            object options = CreateOptions();
            Server.Start(options);
        }

        public void StopServer()
        {
            Server.Stop();
        }

        public async Task<IConnection> ConnectAsync()
        {
            var conn = new Connection(this);
            try
            {
                await conn.StartAsync();
                return conn;
            }
            catch (Exception)
            {
                conn.Dispose();
                throw;
            }
        }

        public string GetCollectionName<T>() where T : IIdentifiable
        {
            DocConfig docConfig = GetDocConfig<T>();
            return GetCollectionName(docConfig.RootDataType);
        }

        public async Task DeleteProjectAsync(string projectId)
        {
            var tasks = new List<Task>();
            foreach (DocConfig docConfig in _realtimeOptions.Value.Docs)
                tasks.Add(DeleteProjectDocsAsync(docConfig.RootDataType, projectId));
            await Task.WhenAll(tasks);

            string collectionName = GetCollectionName(RootDataTypes.Projects);

            IMongoCollection<BsonDocument> snapshotCollection = _database.GetCollection<BsonDocument>(collectionName);
            FilterDefinition<BsonDocument> idFilter = Builders<BsonDocument>.Filter.Regex("_id", projectId);
            await snapshotCollection.DeleteManyAsync(idFilter);

            IMongoCollection<BsonDocument> opsCollection = _database.GetCollection<BsonDocument>("o_" + collectionName);
            FilterDefinition<BsonDocument> dFilter = Builders<BsonDocument>.Filter.Regex("d", projectId);
            await opsCollection.DeleteManyAsync(dFilter);
        }

        public IQueryable<T> QuerySnapshots<T>() where T : IIdentifiable
        {
            string collectionName = GetCollectionName<T>();
            IMongoCollection<T> collection = _database.GetCollection<T>(collectionName);
            return collection.AsQueryable();
        }

        internal DocConfig GetDocConfig<T>() where T : IIdentifiable
        {
            return _docConfigs[typeof(T)];
        }

        internal string GetCollectionName(string rootDataType)
        {
            if (rootDataType == RootDataTypes.Projects)
                return $"{_dataAccessOptions.Value.Prefix}_{rootDataType.Underscore()}";
            return rootDataType.Underscore();
        }

        protected override void DisposeManagedResources()
        {
            StopServer();
        }

        private void AddDocConfig(DocConfig docConfig)
        {
            if (docConfig.Type == null)
            {
                throw new ArgumentException($"The doc config {docConfig.RootDataType} does not have a type set.",
                    nameof(docConfig));
            }
            _docConfigs[docConfig.Type] = docConfig;
        }

        private async Task DeleteProjectDocsAsync(string type, string projectId)
        {
            string collectionName = GetCollectionName(type);

            IMongoCollection<BsonDocument> snapshotCollection = _database.GetCollection<BsonDocument>(collectionName);
            FilterDefinition<BsonDocument> idFilter = Builders<BsonDocument>.Filter.Regex("_id", $"^{projectId}");
            await snapshotCollection.DeleteManyAsync(idFilter);

            IMongoCollection<BsonDocument> opsCollection = _database.GetCollection<BsonDocument>("o_" + collectionName);
            FilterDefinition<BsonDocument> dFilter = Builders<BsonDocument>.Filter.Regex("d", $"^{projectId}");
            await opsCollection.DeleteManyAsync(dFilter);
        }

        private object CreateOptions()
        {
            string mongo = $"{_dataAccessOptions.Value.ConnectionString}/{_dataAccessOptions.Value.MongoDatabaseName}";
            return new
            {
                AppModuleName = _realtimeOptions.Value.AppModuleName,
                ConnectionString = mongo,
                Port = _realtimeOptions.Value.Port,
                Authority = $"https://{_authOptions.Value.Domain}/",
                Audience = _authOptions.Value.Audience,
                Scope = _authOptions.Value.Scope
            };
        }
    }
}
