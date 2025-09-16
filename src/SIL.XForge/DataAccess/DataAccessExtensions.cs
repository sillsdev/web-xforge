using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Threading;
using System.Threading.Tasks;
using MongoDB.Driver.Linq;
using SIL.XForge.Models;
using SIL.XForge.Utils;

namespace SIL.XForge.DataAccess;

public static class DataAccessExtensions
{
    public static Task<T> UpdateAsync<T>(
        this IRepository<T> repo,
        string id,
        Action<IUpdateBuilder<T>> update,
        bool upsert = false,
        CancellationToken cancellationToken = default
    )
        where T : IIdentifiable => repo.UpdateAsync(e => e.Id == id, update, upsert, cancellationToken);

    public static Task<T> UpdateAsync<T>(
        this IRepository<T> repo,
        T entity,
        Action<IUpdateBuilder<T>> update,
        bool upsert = false,
        CancellationToken cancellationToken = default
    )
        where T : IIdentifiable => repo.UpdateAsync(entity.Id, update, upsert, cancellationToken);

    public static Task<T> DeleteAsync<T>(
        this IRepository<T> repo,
        string id,
        CancellationToken cancellationToken = default
    )
        where T : IIdentifiable => repo.DeleteAsync(e => e.Id == id, cancellationToken);

    public static async Task<T> GetAsync<T>(
        this IRepository<T> repo,
        string id,
        CancellationToken cancellationToken = default
    )
        where T : IIdentifiable
    {
        Attempt<T> attempt = await repo.TryGetAsync(id, cancellationToken);
        if (attempt.Success)
            return attempt.Result;
        return default;
    }

    public static async Task<IReadOnlyList<T>> GetAllAsync<T>(
        this IRepository<T> repo,
        CancellationToken cancellationToken = default
    )
        where T : IIdentifiable => await repo.Query().ToListAsync(cancellationToken);

    public static async Task<Attempt<T>> TryGetAsync<T>(
        this IRepository<T> repo,
        string id,
        CancellationToken cancellationToken = default
    )
        where T : IIdentifiable
    {
        T entity = await repo.Query().Where(e => e.Id == id).FirstOrDefaultAsync(cancellationToken);
        return new Attempt<T>(entity != null, entity);
    }

    public static async Task<T> FirstOrDefaultAsync<T>(
        this IQueryable<T> queryable,
        CancellationToken cancellationToken = default
    )
    {
        if (queryable.Provider is IMongoQueryProvider)
            return await MongoQueryable.FirstOrDefaultAsync(queryable, cancellationToken);
        else
            return queryable.FirstOrDefault();
    }

    public static async Task<T> FirstOrDefaultAsync<T>(
        this IQueryable<T> queryable,
        Expression<Func<T, bool>> predicate,
        CancellationToken cancellationToken = default
    )
    {
        if (queryable.Provider is IMongoQueryProvider)
            return await MongoQueryable.FirstOrDefaultAsync(queryable, predicate, cancellationToken);
        else
            return queryable.FirstOrDefault(predicate);
    }

    public static async Task<bool> AnyAsync<T>(
        this IQueryable<T> queryable,
        Expression<Func<T, bool>> predicate,
        CancellationToken cancellationToken = default
    )
    {
        if (queryable.Provider is IMongoQueryProvider)
            return await MongoQueryable.AnyAsync(queryable, predicate, cancellationToken);
        else
            return queryable.Any(predicate);
    }

    public static async Task<int> CountAsync<T>(
        this IQueryable<T> queryable,
        CancellationToken cancellationToken = default
    )
    {
        if (queryable.Provider is IMongoQueryProvider)
            return await MongoQueryable.CountAsync(queryable, cancellationToken);
        else
            return queryable.Count();
    }

    public static async Task<List<T>> ToListAsync<T>(
        this IQueryable<T> queryable,
        CancellationToken cancellationToken = default
    )
    {
        if (queryable.Provider is IMongoQueryProvider)
            return await MongoQueryable.ToListAsync(queryable, cancellationToken);
        else
            return [.. queryable];
    }
}
