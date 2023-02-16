using System.Collections.Generic;
using System.Threading.Tasks;

namespace SIL.XForge.Realtime;

public interface IRealtimeServer
{
    Task<T> ApplyOpAsync<T>(string otTypeName, T data, object op);
    Task<int> ConnectAsync(string userId = null);
    Task<Snapshot<T>> CreateDocAsync<T>(int handle, string collection, string id, T data, string otTypeName);
    Task DeleteDocAsync(int handle, string collection, string id);
    void Disconnect(int handle);
    Task DisconnectAsync(int handle);
    Task<Snapshot<T>> FetchDocAsync<T>(int handle, string collection, string id);
    Task<Snapshot<T>[]> FetchDocsAsync<T>(int handle, string collection, IReadOnlyCollection<string> ids);
    void Start(object options);
    void Stop();
    Task<Snapshot<T>> SubmitOpAsync<T>(int handle, string collection, string id, object op);
}
