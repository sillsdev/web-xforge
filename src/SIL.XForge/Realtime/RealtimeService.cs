using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Hangfire;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Driver;
using SIL.ObjectModel;
using SIL.XForge.Configuration;
using SIL.XForge.Models;

namespace SIL.XForge.Realtime;

/// <summary>
/// This service is responsible for managing the real-time/ShareDB server. It provides methods for accessing
/// real-time data and performing actions on the server.
/// </summary>
public class RealtimeService : DisposableBase, IRealtimeService
{
    private readonly IExceptionHandler _exceptionHandler;
    private readonly IOptions<SiteOptions> _siteOptions;
    private readonly IOptions<DataAccessOptions> _dataAccessOptions;
    private readonly IOptions<RealtimeOptions> _realtimeOptions;
    private readonly IOptions<AuthOptions> _authOptions;
    private readonly IMongoDatabase _database;
    private readonly IRecurringJobManager _recurringJobManager;
    private readonly Dictionary<Type, DocConfig> _docConfigs;
    private readonly IConfiguration _configuration;
    private int restartDelay = 0;

    public RealtimeService(
        IRealtimeServer server,
        IExceptionHandler exceptionHandler,
        IOptions<SiteOptions> siteOptions,
        IOptions<DataAccessOptions> dataAccessOptions,
        IOptions<RealtimeOptions> realtimeOptions,
        IOptions<AuthOptions> authOptions,
        IMongoClient mongoClient,
        IRecurringJobManager recurringJobManager,
        IConfiguration configuration
    )
    {
        Server = server;
        _exceptionHandler = exceptionHandler;
        _recurringJobManager = recurringJobManager;
        _siteOptions = siteOptions;
        _dataAccessOptions = dataAccessOptions;
        _realtimeOptions = realtimeOptions;
        _authOptions = authOptions;
        _database = mongoClient.GetDatabase(_dataAccessOptions.Value.MongoDatabaseName);
        _configuration = configuration;

        RealtimeOptions options = _realtimeOptions.Value;
        _docConfigs = new Dictionary<Type, DocConfig>();
        AddDocConfig(options.UserDoc);
        AddDocConfig(options.ProjectDoc);
        foreach (DocConfig projectDataDoc in options.ProjectDataDocs)
        {
            AddDocConfig(projectDataDoc);
        }
        foreach (DocConfig userDataDoc in options.UserDataDocs)
        {
            AddDocConfig(userDataDoc);
        }
    }

    internal IRealtimeServer Server { get; }

    public void StartServer()
    {
        if (!_realtimeOptions.Value.UseExistingRealtimeServer)
        {
            object options = CreateOptions();
            Server.Start(options);
        }

        SetPingServiceSchedule();
    }

    public void StopServer()
    {
        if (!_realtimeOptions.Value.UseExistingRealtimeServer)
        {
            Server.Stop();
            _recurringJobManager.RemoveIfExists("ping_service");
        }
    }

    [DeleteOnSuccess]
    public void CheckIfRunning()
    {
        if (!Server.IsServerRunning())
            RestartServer();
    }

    public async Task<IConnection> ConnectAsync(string userId = null)
    {
        RealtimeOptions options = _realtimeOptions.Value;
        var conn = new Connection(this, options.DocumentCacheDisabled);
        try
        {
            await conn.StartAsync(userId);
            return conn;
        }
        catch (Exception)
        {
            conn.Dispose();
            throw;
        }
    }

    public string GetCollectionName<T>()
        where T : IIdentifiable
    {
        DocConfig docConfig = GetDocConfig<T>();
        return docConfig.CollectionName;
    }

    /// <summary>
    /// Delete project-related docs from various collections.
    /// </summary>
    public async Task DeleteProjectAsync(string projectId)
    {
        if (string.IsNullOrEmpty(projectId))
        {
            throw new ArgumentException("", nameof(projectId));
        }

        RealtimeOptions options = _realtimeOptions.Value;
        var tasks = new List<Task>();
        foreach (DocConfig docConfig in options.ProjectDataDocs)
            tasks.Add(DeleteProjectDocsAsync(docConfig.CollectionName, projectId));
        await Task.WhenAll(tasks);

        IMongoCollection<BsonDocument> snapshotCollection = _database.GetCollection<BsonDocument>(
            options.ProjectDoc.CollectionName
        );
        FilterDefinition<BsonDocument> idFilter = Builders<BsonDocument>.Filter.Eq("_id", projectId);
        await snapshotCollection.DeleteManyAsync(idFilter);

        IMongoCollection<BsonDocument> opsCollection = _database.GetCollection<BsonDocument>(
            $"o_{options.ProjectDoc.CollectionName}"
        );
        FilterDefinition<BsonDocument> dFilter = Builders<BsonDocument>.Filter.Eq("d", projectId);
        await opsCollection.DeleteManyAsync(dFilter);

        IMongoCollection<BsonDocument> milestonesCollection = _database.GetCollection<BsonDocument>(
            $"m_{options.ProjectDoc.CollectionName}"
        );
        await milestonesCollection.DeleteManyAsync(dFilter);
    }

    /// <summary>
    /// Delete user-related docs from various collections.
    /// </summary>
    public async Task DeleteUserAsync(string userId)
    {
        if (string.IsNullOrEmpty(userId))
        {
            throw new ArgumentException("", nameof(userId));
        }

        RealtimeOptions options = _realtimeOptions.Value;
        IEnumerable<DocConfig> collectionsToProcess = options.UserDataDocs.Append(options.UserDoc);
        FilterDefinition<BsonDocument> idFilter = Builders<BsonDocument>.Filter.Regex("_id", $"{userId}$");
        FilterDefinition<BsonDocument> dFilter = Builders<BsonDocument>.Filter.Regex("d", $"{userId}$");
        foreach (var collection in collectionsToProcess)
        {
            IMongoCollection<BsonDocument> snapshotCollection = _database.GetCollection<BsonDocument>(
                collection.CollectionName
            );
            await snapshotCollection.DeleteManyAsync(idFilter);

            IMongoCollection<BsonDocument> opsCollection = _database.GetCollection<BsonDocument>(
                $"o_{collection.CollectionName}"
            );
            await opsCollection.DeleteManyAsync(dFilter);

            IMongoCollection<BsonDocument> milestonesCollection = _database.GetCollection<BsonDocument>(
                $"m_{collection.CollectionName}"
            );
            await milestonesCollection.DeleteManyAsync(dFilter);
        }
    }

    public IQueryable<T> QuerySnapshots<T>()
        where T : IIdentifiable
    {
        string collectionName = GetCollectionName<T>();
        IMongoCollection<T> collection = _database.GetCollection<T>(collectionName);
        return collection.AsQueryable();
    }

    /// <summary>
    /// Gets the id of the user who last modified the object asynchronously.
    /// </summary>
    /// <typeparam name="T">The type in MongoDB</typeparam>
    /// <param name="id">The identifier.</param>
    /// <param name="version">The version. If 0 or lower, the version is ignored.</param>
    /// <returns>
    /// The user id, or null if unknown.
    /// </returns>
    public async Task<string> GetLastModifiedUserIdAsync<T>(string id, int version)
        where T : IIdentifiable
    {
        // Get the collection and definitions
        string collectionName = GetCollectionName<T>();
        IMongoCollection<BsonDocument> opsCollection = _database.GetCollection<BsonDocument>($"o_{collectionName}");
        FilterDefinitionBuilder<BsonDocument> builder = Builders<BsonDocument>.Filter;
        FilterDefinition<BsonDocument> filter = builder.Eq("d", id);
        if (version > 0)
        {
            // The version in the Document is always one more than the version in the operations table
            filter &= builder.Lt("v", version);
        }

        FieldDefinition<BsonDocument> field = "v";
        SortDefinition<BsonDocument> sort = Builders<BsonDocument>.Sort.Descending(field);

        // Use FindAsync(), as opposed to Find(), so that we can mock it
        using IAsyncCursor<BsonDocument> cursor = await opsCollection.FindAsync(
            filter,
            new FindOptions<BsonDocument, BsonDocument>() { Limit = 1, Sort = sort }
        );
        BsonDocument doc = await cursor.FirstOrDefaultAsync();

        // Retrieve uId from the metadata, if present
        // uId is set by sharedb-access, and will be missing if this op was created by a sync
        if (
            doc != null
            && doc.TryGetValue("m", out BsonValue mValue)
            && mValue is BsonDocument mDoc
            && mDoc.TryGetValue("uId", out BsonValue uidValue)
            && uidValue is BsonString uidString
        )
        {
            return uidString.Value;
        }

        // Default to null
        return null;
    }

    internal DocConfig GetDocConfig<T>()
        where T : IIdentifiable => _docConfigs[typeof(T)];

    protected override void DisposeManagedResources() => StopServer();

    private void AddDocConfig(DocConfig docConfig) => _docConfigs[docConfig.Type] = docConfig;

    private async Task DeleteProjectDocsAsync(string collectionName, string projectId)
    {
        IMongoCollection<BsonDocument> snapshotCollection = _database.GetCollection<BsonDocument>(collectionName);
        FilterDefinition<BsonDocument> idFilter = Builders<BsonDocument>.Filter.Regex("_id", $"^{projectId}");
        await snapshotCollection.DeleteManyAsync(idFilter);

        IMongoCollection<BsonDocument> opsCollection = _database.GetCollection<BsonDocument>($"o_{collectionName}");
        FilterDefinition<BsonDocument> dFilter = Builders<BsonDocument>.Filter.Regex("d", $"^{projectId}");
        await opsCollection.DeleteManyAsync(dFilter);

        IMongoCollection<BsonDocument> milestonesCollection = _database.GetCollection<BsonDocument>(
            $"m_{collectionName}"
        );
        await milestonesCollection.DeleteManyAsync(dFilter);
    }

    private void RestartServer()
    {
        Console.WriteLine("Attempting to restart the Realtime Server");
        string restartResponse;
        if (Server.Restart(CreateOptions()))
        {
            restartDelay = 0;
            SetPingServiceSchedule();
            restartResponse = "Successfully restarted the Realtime Server";
        }
        else
        {
            if (restartDelay < 30)
                restartDelay += 5;
            SetPingServiceSchedule($"*/{restartDelay} * * * *");
            restartResponse = $"Failed to restart the Realtime Server - retrying in {restartDelay} minutes";
        }
        Console.WriteLine(restartResponse);
        _exceptionHandler.ReportException(new Exception(restartResponse));
    }

    private void SetPingServiceSchedule(string schedule = "* * * * *") =>
        _recurringJobManager.AddOrUpdate("ping_service", () => CheckIfRunning(), schedule);

    private object CreateOptions()
    {
        string mongo = $"{_dataAccessOptions.Value.ConnectionString}/{_dataAccessOptions.Value.MongoDatabaseName}";
        return new
        {
            _realtimeOptions.Value.AppModuleName,
            ConnectionString = mongo,
            _realtimeOptions.Value.Port,
            Authority = $"https://{_authOptions.Value.Domain}/",
            _authOptions.Value.Audience,
            _authOptions.Value.Scope,
            Origin = _configuration.GetValue<string>("Site:Origin"),
            BugsnagApiKey = _configuration.GetValue<string>("Bugsnag:ApiKey"),
            ReleaseStage = _configuration.GetValue<string>("Bugsnag:ReleaseStage"),
            _realtimeOptions.Value.MigrationsDisabled,
            _realtimeOptions.Value.DataValidationDisabled,
            SiteId = _siteOptions.Value.Id,
            Product.Version,
        };
    }
}
