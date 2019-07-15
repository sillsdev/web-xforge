using System;
using System.Linq.Expressions;
using System.Threading.Tasks;
using SIL.XForge.Models;

namespace SIL.XForge.DataAccess
{
    public interface IRepository<T> : IReadOnlyRepository<T> where T : IEntity
    {
        Task InsertAsync(T entity);
        Task<bool> ReplaceAsync(T entity, bool upsert = false);
        Task<T> UpdateAsync(Expression<Func<T, bool>> filter, Action<IUpdateBuilder<T>> update, bool upsert = false);
        Task<T> DeleteAsync(Expression<Func<T, bool>> filter);
        Task<int> DeleteAllAsync(Expression<Func<T, bool>> filter);
    }
}
