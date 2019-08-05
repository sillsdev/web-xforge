using System.Collections.Generic;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;

namespace SIL.XForge.Realtime
{
    public class MemoryConnection : IConnection
    {
        private readonly MemoryRealtimeService _realtimeService;
        private readonly Dictionary<(string, string), object> _documents;

        internal MemoryConnection(MemoryRealtimeService realtimeService)
        {
            _realtimeService = realtimeService;
            _documents = new Dictionary<(string, string), object>();
        }

        public IDocument<T> Get<T>(string id) where T : IIdentifiable
        {
            DocConfig docConfig = _realtimeService.GetDocConfig<T>();
            string collection = _realtimeService.GetCollectionName(docConfig.RootDataType);
            if (_documents.TryGetValue((collection, id), out object docObj))
                return (IDocument<T>)docObj;

            MemoryRepository<T> repo = _realtimeService.GetRepository<T>();
            IDocument<T> doc = new MemoryDocument<T>(repo, docConfig.OTTypeName, collection, id);
            _documents[(collection, id)] = doc;
            return doc;
        }

        public void Dispose()
        {
        }
    }
}
