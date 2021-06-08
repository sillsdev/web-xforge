using System;
using System.Linq.Expressions;
using System.Threading.Tasks;
using SIL.XForge.Models;

namespace SIL.XForge.Realtime
{
    public interface IConnection : IDisposable
    {
        IRealtimeServer BeginTransaction();
        Task CommitTransactionAsync();
        void ExcludePropertyFromTransaction<T>(Expression<Func<T, object>> field);
        IDocument<T> Get<T>(string id) where T : IIdentifiable;
        Task RollbackTransactionAsync();
    }
}
