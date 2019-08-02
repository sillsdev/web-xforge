using System.Threading;
using System.Threading.Tasks;
using SIL.XForge.Models;

namespace SIL.XForge.Realtime
{
    public class Document<T> : IDocument<T> where T : IIdentifiable
    {
        private readonly RealtimeServer _server;
        private readonly int _connHandle;
        private readonly SemaphoreSlim _lock = new SemaphoreSlim(1, 1);

        internal Document(RealtimeServer server, int connHandle, string otTypeName, string collection, string id)
        {
            _server = server;
            _connHandle = connHandle;
            OTTypeName = otTypeName;
            Collection = collection;
            Id = id;
        }

        public string Collection { get; }

        public string Id { get; }

        public int Version { get; private set; } = -1;

        public string OTTypeName { get; }

        public T Data { get; private set; }

        public bool IsLoaded => Data != null;

        public async Task CreateAsync(T data)
        {
            Snapshot<T> snapshot = await _server.CreateDocAsync(_connHandle, Collection, Id, data, OTTypeName);
            await UpdateFromSnapshotAsync(snapshot);
        }

        public async Task FetchAsync()
        {
            Snapshot<T> snapshot = await _server.FetchDocAsync<T>(_connHandle, Collection, Id);
            await UpdateFromSnapshotAsync(snapshot);
        }

        public async Task SubmitOpAsync(object op)
        {
            Snapshot<T> snapshot = await _server.SubmitOpAsync<T>(_connHandle, Collection, Id, op);
            await UpdateFromSnapshotAsync(snapshot);
        }

        public async Task DeleteAsync()
        {
            await _server.DeleteDocAsync(_connHandle, Collection, Id);
            await _lock.WaitAsync();
            try
            {
                Version = -1;
                Data = default(T);
            }
            finally
            {
                _lock.Release();
            }
        }

        private async Task UpdateFromSnapshotAsync(Snapshot<T> snapshot)
        {
            await _lock.WaitAsync();
            try
            {
                Version = snapshot.Version;
                Data = snapshot.Data;
                if (Data != null)
                    Data.Id = Id;
            }
            finally
            {
                _lock.Release();
            }
        }
    }
}
