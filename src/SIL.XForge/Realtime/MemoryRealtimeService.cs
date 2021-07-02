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

namespace SIL.XForge.Realtime
{
    public class MemoryRealtimeService : IRealtimeService
    {
        internal static readonly RealtimeServer Server = new RealtimeServer(CreateNodeJSService());

        private static INodeJSService CreateNodeJSService()
        {
            var services = new ServiceCollection();
            services.AddNodeJS();
            services.Configure<NodeJSProcessOptions>(options =>
            {
                options.ProjectPath = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
                // only uncomment the two lines below when debugging on the Node side otherwise C# build is paused
                // options.NodeAndV8Options = "--inspect-brk=9230";
            });
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
        /// Count of calls to DeleteUserAsync(), for tests.
        /// </summary>
        internal int CallCountDeleteUserAsync { get; set; } = 0;

        public void StartServer()
        {
        }

        public void StopServer()
        {
        }

        public Task<IConnection> ConnectAsync(string userId = null)
        {
            return Task.FromResult<IConnection>(new MemoryConnection(this));
        }

        public virtual Task DeleteProjectAsync(string projectId)
        {
            return Task.CompletedTask;
        }

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

        public Task<string> GetLastModifiedUserIdAsync<T>(string id) where T : IIdentifiable
        {
            return Task.FromResult<string>(null);
        }

        public IQueryable<T> QuerySnapshots<T>() where T : IIdentifiable
        {
            return GetRepository<T>().Query();
        }

        public void AddRepository<T>(string collectionName, string otTypeName, MemoryRepository<T> repo)
            where T : IIdentifiable
        {
            _repos[typeof(T)] = repo;
            _docConfigs[typeof(T)] = new DocConfig(collectionName, typeof(T), otTypeName);
        }

        public MemoryRepository<T> GetRepository<T>() where T : IIdentifiable
        {
            return (MemoryRepository<T>)_repos[typeof(T)];
        }

        internal DocConfig GetDocConfig<T>() where T : IIdentifiable
        {
            return _docConfigs[typeof(T)];
        }
    }
}
