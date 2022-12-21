using System;
using System.Linq.Expressions;
using System.Threading.Tasks;
using SIL.XForge.Models;

namespace SIL.XForge.Realtime;

public interface IConnection : IDisposable
{
    void BeginTransaction();
    Task CommitTransactionAsync();
    Task<Snapshot<T>> CreateDocAsync<T>(string collection, string id, T data, string otTypeName);
    Task DeleteDocAsync(string collection, string id);
    void ExcludePropertyFromTransaction<T>(Expression<Func<T, object>> field);
    Task<Snapshot<T>> FetchDocAsync<T>(string collection, string id);
    IDocument<T> Get<T>(string id) where T : IIdentifiable;
    void RollbackTransaction();
    Task<Snapshot<T>> SubmitOpAsync<T>(string collection, string id, object op, T currentDoc, int currentVersion);
}
