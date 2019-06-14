using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.NodeServices;
using SIL.ObjectModel;

namespace SIL.XForge.Realtime
{
    public class Connection : DisposableBase, IConnection
    {
        private readonly INodeServices _nodeServices;
        private readonly string _modulePath;
        private int _handle;

        private readonly Dictionary<string, Dictionary<string, object>> _documents;

        public Connection(INodeServices nodeServices, string modulePath)
        {
            _nodeServices = nodeServices;
            _modulePath = modulePath;
            _documents = new Dictionary<string, Dictionary<string, object>>();
        }

        public async Task StartAsync()
        {
            _handle = await _nodeServices.InvokeExportAsync<int>(_modulePath, "connect");
        }

        public IDocument<TData, TOp> Get<TData, TOp>(string collection, string id)
        {
            if (!_documents.TryGetValue(collection, out Dictionary<string, object> docs))
            {
                docs = new Dictionary<string, object>();
                _documents[collection] = docs;
            }

            if (!docs.TryGetValue(id, out object doc))
            {
                doc = new Document<TData, TOp>(this, collection, id);
                docs[id] = doc;
            }
            return (Document<TData, TOp>)doc;
        }

        internal Task<T> InvokeAsync<T>(string functionName, params object[] args)
        {
            return _nodeServices.InvokeExportAsync<T>(_modulePath, functionName,
                new object[] { _handle }.Concat(args).ToArray());
        }

        protected override void DisposeManagedResources()
        {
            _nodeServices.InvokeExportAsync<object>(_modulePath, "disconnect", _handle).GetAwaiter().GetResult();
        }
    }
}
