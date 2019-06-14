using System.Collections.Generic;
using System.Threading.Tasks;

namespace SIL.XForge.Realtime
{
    public class Document<TData, TOp> : IDocument<TData, TOp>
    {
        private readonly Connection _conn;

        internal Document(Connection conn, string collection, string id)
        {
            _conn = conn;
            Collection = collection;
            Id = id;
        }

        public string Collection { get; }

        public string Id { get; }

        public int Version { get; private set; } = -1;

        public string Type { get; private set; }

        public TData Data { get; private set; }

        public bool IsLoaded { get; private set; }

        public async Task CreateAsync(TData data, string type)
        {
            var snapshot = await _conn.InvokeAsync<Snapshot<TData>>("createDoc", Collection, Id, data, type);
            UpdateFromSnapshot(snapshot);
        }

        public async Task FetchAsync()
        {
            var snapshot = await _conn.InvokeAsync<Snapshot<TData>>("fetchDoc", Collection, Id);
            UpdateFromSnapshot(snapshot);
        }

        public async Task SubmitOpAsync(TOp op)
        {
            var snapshot = await _conn.InvokeAsync<Snapshot<TData>>("submitOp", Collection, Id, op);
            UpdateFromSnapshot(snapshot);
        }

        public async Task SubmitOpsAsync(IEnumerable<TOp> ops)
        {
            var snapshot = await _conn.InvokeAsync<Snapshot<TData>>("submitOp", Collection, Id, ops);
            UpdateFromSnapshot(snapshot);
        }

        public async Task DeleteAsync()
        {
            await _conn.InvokeAsync<object>("deleteDoc", Collection, Id);
            Version = -1;
            Type = null;
            Data = default(TData);
            IsLoaded = false;
        }

        private void UpdateFromSnapshot(Snapshot<TData> snapshot)
        {
            Version = snapshot.Version;
            Data = snapshot.Data;
            Type = snapshot.Type;
            IsLoaded = true;
        }
    }
}
