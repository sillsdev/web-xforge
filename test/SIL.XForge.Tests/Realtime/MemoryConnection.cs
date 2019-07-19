using System.Collections.Generic;
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

        public IDocument<T> Get<T>(string type, string id) where T : IIdentifiable
        {
            if (_documents.TryGetValue((type, id), out object docObj))
                return (IDocument<T>)docObj;

            MemoryRepository<T> repo = _realtimeService.GetRepository<T>(type);
            string otTypeName = _realtimeService.GetOtTypeName(type);
            string collection = _realtimeService.GetCollectionName(type);
            IDocument<T> doc = new MemoryDocument<T>(repo, otTypeName, collection, id);
            _documents[(type, id)] = doc;
            return doc;
        }

        public void Dispose()
        {
        }
    }
}
