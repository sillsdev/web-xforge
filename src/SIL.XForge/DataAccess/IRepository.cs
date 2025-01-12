using System;
using System.Linq;
using System.Linq.Expressions;
using System.Threading.Tasks;
using SIL.XForge.Models;

namespace SIL.XForge.DataAccess;

public interface IRepository<T>
    where T : IIdentifiable
{
    void Init();
    IQueryable<T> Query();

    Task InsertAsync(T entity);
    Task<bool> ReplaceAsync(T entity, bool upsert = false);
    Task<T> UpdateAsync(Expression<Func<T, bool>> filter, Action<IUpdateBuilder<T>> update, bool upsert = false);
    Task<T> DeleteAsync(Expression<Func<T, bool>> filter);
    Task<long> DeleteAllAsync(Expression<Func<T, bool>> filter);
    Task<long> CountDocumentsAsync(Expression<Func<T, bool>> filter);
}
