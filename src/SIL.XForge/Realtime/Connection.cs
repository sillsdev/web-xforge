using System.Collections.Concurrent;
using System.Threading.Tasks;
using SIL.ObjectModel;
using SIL.XForge.Configuration;
using SIL.XForge.Models;

namespace SIL.XForge.Realtime
{
    /// <summary>
    /// This class represents a connection with the real-time server.
    /// </summary>
    public class Connection : DisposableBase, IConnection
    {
        private readonly RealtimeService _realtimeService;
        private int _handle;

        private readonly ConcurrentDictionary<(string, string), object> _documents;

        internal Connection(RealtimeService realtimeService)
        {
            _realtimeService = realtimeService;
            _documents = new ConcurrentDictionary<(string, string), object>();
        }

        public IDocument<T> Get<T>(string id) where T : IIdentifiable
        {
            DocConfig docConfig = _realtimeService.GetDocConfig<T>();
            object doc = _documents.GetOrAdd((docConfig.CollectionName, id), key =>
            {
                string otTypeName = docConfig.OTTypeName;
                return new Document<T>(_realtimeService.Server, _handle, otTypeName, docConfig.CollectionName, id);
            });
            return (Document<T>)doc;
        }

        internal async Task StartAsync()
        {
            _handle = await _realtimeService.Server.ConnectAsync();
        }

        protected override void DisposeManagedResources()
        {
            _realtimeService.Server.Disconnect(_handle);
        }
    }
}
