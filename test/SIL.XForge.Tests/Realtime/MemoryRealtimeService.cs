using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Humanizer;
using Microsoft.AspNetCore.NodeServices;
using Microsoft.Extensions.DependencyInjection;
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

        private readonly Dictionary<string, object> _repos;
        private readonly Dictionary<string, string> _otTypeNames;

        public MemoryRealtimeService()
        {
            _repos = new Dictionary<string, object>();
            _otTypeNames = new Dictionary<string, string>();
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

        public string GetCollectionName(string type)
        {
            return type.Underscore();
        }

        public IQueryable<T> QuerySnapshots<T>(string type) where T : IIdentifiable
        {
            return GetRepository<T>(type).Query();
        }

        public void AddRepository<T>(string type, string otTypeName, MemoryRepository<T> repo) where T : IIdentifiable
        {
            _repos[type] = repo;
            _otTypeNames[type] = otTypeName;
        }

        public MemoryRepository<T> GetRepository<T>(string type) where T : IIdentifiable
        {
            return (MemoryRepository<T>)_repos[type];
        }

        internal string GetOtTypeName(string type)
        {
            return _otTypeNames[type];
        }
    }
}
