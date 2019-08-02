using System.Collections.Concurrent;
using System.Threading.Tasks;
using SIL.ObjectModel;
using SIL.XForge.Models;

namespace SIL.XForge.Realtime
{
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

        public async Task StartAsync()
        {
            _handle = await _realtimeService.Server.ConnectAsync();
        }

        public IDocument<T> Get<T>(string type, string id) where T : IIdentifiable
        {
            string collection = _realtimeService.GetCollectionName(type);

            object doc = _documents.GetOrAdd((type, id), key =>
            {
                string otTypeName = _realtimeService.GetOTTypeName(type);
                return new Document<T>(_realtimeService.Server, _handle, otTypeName, collection, id);
            });
            return (Document<T>)doc;
        }

        protected override void DisposeManagedResources()
        {
            _realtimeService.Server.Disconnect(_handle);
        }
    }
}
