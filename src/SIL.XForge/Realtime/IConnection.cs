using System;
using System.Collections.Generic;
using System.Linq.Expressions;
using System.Threading.Tasks;
using SIL.XForge.Models;

namespace SIL.XForge.Realtime;

public interface IConnection : IDisposable, IAsyncDisposable
{
    void BeginTransaction();
    Task CommitTransactionAsync();
    Task<Snapshot<T>> CreateDocAsync<T>(string collection, string id, T data, string otTypeName, OpSource? source);
    Task DeleteDocAsync(string collection, string id);
    void ExcludePropertyFromTransaction<T>(Expression<Func<T, object>> field);
    Task<Snapshot<T>> FetchDocAsync<T>(string collection, string id);

    Task<Snapshot<T>> FetchSnapshotAsync<T>(string id, DateTime timestamp)
        where T : class, IIdentifiable;
    Task<Snapshot<T>[]> FetchSnapshotsAsync<T>(IReadOnlyCollection<string> ids, DateTime timestamp)
        where T : class, IIdentifiable;
    Task<Op[]> GetOpsAsync<T>(string id)
        where T : class, IIdentifiable;
    IDocument<T> Get<T>(string id)
        where T : class, IIdentifiable;
    Task<IReadOnlyCollection<IDocument<T>>> GetAndFetchDocsAsync<T>(IReadOnlyCollection<string> ids)
        where T : class, IIdentifiable;
    void RollbackTransaction();
    Task<Snapshot<T>> SubmitOpAsync<T>(
        string collection,
        string id,
        object op,
        T currentDoc,
        int currentVersion,
        SubmitOptions? options
    )
        where T : class;
    Task<Snapshot<T>> ReplaceDocAsync<T>(string collection, string id, T data, int currentVersion, OpSource? source);
}
