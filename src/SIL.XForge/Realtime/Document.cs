using System.Threading.Tasks;

namespace SIL.XForge.Realtime
{
    public class Document<TData> : IDocument<TData>
    {
        private readonly Connection _conn;

        internal Document(Connection conn, string otTypeName, string collection, string id)
        {
            _conn = conn;
            OTTypeName = otTypeName;
            Collection = collection;
            Id = id;
        }

        public string Collection { get; }

        public string Id { get; }

        public int Version { get; private set; } = -1;

        public string OTTypeName { get; }

        public TData Data { get; private set; }

        public bool IsLoaded => Data != null;

        public async Task CreateAsync(TData data)
        {
            var snapshot = await _conn.InvokeExportAsync<Snapshot<TData>>("createDoc", Collection, Id, data,
                OTTypeName);
            UpdateFromSnapshot(snapshot);
        }

        public async Task FetchAsync()
        {
            var snapshot = await _conn.InvokeExportAsync<Snapshot<TData>>("fetchDoc", Collection, Id);
            UpdateFromSnapshot(snapshot);
        }

        public async Task SubmitOpAsync(object op)
        {
            var snapshot = await _conn.InvokeExportAsync<Snapshot<TData>>("submitOp", Collection, Id, op);
            UpdateFromSnapshot(snapshot);
        }

        public async Task DeleteAsync()
        {
            await _conn.InvokeExportAsync<object>("deleteDoc", Collection, Id);
            Version = -1;
            Data = default(TData);
        }

        private void UpdateFromSnapshot(Snapshot<TData> snapshot)
        {
            Version = snapshot.Version;
            Data = snapshot.Data;
        }
    }
}
