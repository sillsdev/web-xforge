using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using SIL.ObjectModel;

namespace SIL.XForge.Realtime
{
    public class Connection : DisposableBase, IConnection
    {
        private readonly RealtimeService _realtimeService;
        private int _handle;

        private readonly Dictionary<string, Dictionary<string, object>> _documents;

        internal Connection(RealtimeService realtimeService)
        {
            _realtimeService = realtimeService;
            _documents = new Dictionary<string, Dictionary<string, object>>();
        }

        public async Task StartAsync()
        {
            _handle = await _realtimeService.InvokeExportAsync<int>("connect");
        }

        public IDocument<TData> Get<TData>(string type, string id)
        {
            string collection = _realtimeService.GetCollectionName(type);

            if (!_documents.TryGetValue(collection, out Dictionary<string, object> docs))
            {
                docs = new Dictionary<string, object>();
                _documents[collection] = docs;
            }

            if (!docs.TryGetValue(id, out object doc))
            {
                string otTypeName = _realtimeService.GetOTTypeName(type);
                doc = new Document<TData>(this, otTypeName, collection, id);
                docs[id] = doc;
            }
            return (Document<TData>)doc;
        }

        internal Task<T> InvokeExportAsync<T>(string functionName, params object[] args)
        {
            return _realtimeService.InvokeExportAsync<T>(functionName, new object[] { _handle }.Concat(args).ToArray());
        }

        protected override void DisposeManagedResources()
        {
            InvokeExportAsync<object>("disconnect").GetAwaiter().GetResult();
        }
    }
}
