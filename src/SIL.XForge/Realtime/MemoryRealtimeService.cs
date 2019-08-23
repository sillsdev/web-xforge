using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.NodeServices;
using Microsoft.Extensions.DependencyInjection;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;

namespace SIL.XForge.Realtime
{
    public class MemoryRealtimeService : IRealtimeService
    {
        internal static readonly RealtimeServer Server = new RealtimeServer(CreateNodeServices());

        private static INodeServices CreateNodeServices()
        {
            var services = new ServiceCollection();
            services.AddNodeServices();
            IServiceProvider sp = services.BuildServiceProvider();
            return sp.GetRequiredService<INodeServices>();
        }

        private readonly Dictionary<Type, object> _repos;
        private readonly Dictionary<Type, DocConfig> _docConfigs;

        public MemoryRealtimeService()
        {
            _repos = new Dictionary<Type, object>();
            _docConfigs = new Dictionary<Type, DocConfig>();
        }

        public void StartServer()
        {
        }

        public void StopServer()
        {
        }

        public Task<IConnection> ConnectAsync()
        {
            return Task.FromResult<IConnection>(new MemoryConnection(this));
        }

        public virtual Task DeleteProjectAsync(string projectId)
        {
            return Task.CompletedTask;
        }

        public string GetCollectionName<T>() where T : IIdentifiable
        {
            DocConfig docConfig = GetDocConfig<T>();
            return docConfig.CollectionName;
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
