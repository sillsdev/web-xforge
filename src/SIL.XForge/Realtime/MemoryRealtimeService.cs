using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using Jering.Javascript.NodeJS;
using Microsoft.Extensions.DependencyInjection;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;

namespace SIL.XForge.Realtime;

public class MemoryRealtimeService : IRealtimeService
{
    internal static readonly RealtimeServer Server = new RealtimeServer(CreateNodeJSService());

    private static INodeJSService CreateNodeJSService()
    {
        var services = new ServiceCollection();
        services.AddNodeJS();
        services.Configure<NodeJSProcessOptions>(
            options => options.ProjectPath = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)
        );
        // services.Configure<OutOfProcessNodeJSServiceOptions>(options => options.TimeoutMS = -1);
        services.AddSingleton<IJsonService, RealtimeJsonService>();
        IServiceProvider sp = services.BuildServiceProvider();
        return sp.GetRequiredService<INodeJSService>();
    }

    private readonly Dictionary<Type, object> _repos;
    private readonly Dictionary<Type, DocConfig> _docConfigs;

    public MemoryRealtimeService()
    {
        _repos = new Dictionary<Type, object>();
        _docConfigs = new Dictionary<Type, DocConfig>();
    }

    /// <summary>
    /// Gets or sets the last modified user identifier.
    /// </summary>
    /// <value>
    /// The last modified user identifier.
    /// </value>
    /// <remarks>
    /// This is only for unit test use.
    /// </remarks>
    public string LastModifiedUserId { get; set; }

    /// <summary>
    /// Count of calls to DeleteUserAsync(), for tests.
    /// </summary>
    internal int CallCountDeleteUserAsync { get; set; } = 0;

    public void StartServer() { }

    public void StopServer() { }

    public Task<IConnection> ConnectAsync(string userId = null) =>
        Task.FromResult<IConnection>(new MemoryConnection(this));

    public virtual Task DeleteProjectAsync(string projectId) => Task.CompletedTask;

    public Task DeleteUserAsync(string userId)
    {
        CallCountDeleteUserAsync++;
        return Task.CompletedTask;
    }

    public string GetCollectionName<T>() where T : IIdentifiable
    {
        DocConfig docConfig = GetDocConfig<T>();
        return docConfig.CollectionName;
    }

    /// <summary>
    /// Gets the last modified user's identifier asynchronously.
    /// </summary>
    /// <returns>
    /// Null.
    /// </returns>
    /// <remarks>
    /// This is overridable for unit tests.
    /// </remarks>
    public Task<string> GetLastModifiedUserIdAsync<T>(string id, int version) where T : IIdentifiable =>
        Task.FromResult(LastModifiedUserId);

    public IQueryable<T> QuerySnapshots<T>() where T : IIdentifiable => GetRepository<T>().Query();

    public void AddRepository<T>(string collectionName, string otTypeName, MemoryRepository<T> repo)
        where T : IIdentifiable
    {
        _repos[typeof(T)] = repo;
        _docConfigs[typeof(T)] = new DocConfig(collectionName, typeof(T), otTypeName);
    }

    public MemoryRepository<T> GetRepository<T>() where T : IIdentifiable => (MemoryRepository<T>)_repos[typeof(T)];

    internal DocConfig GetDocConfig<T>() where T : IIdentifiable => _docConfigs[typeof(T)];
}
