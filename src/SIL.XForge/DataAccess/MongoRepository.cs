using System;
using System.Linq;
using System.Linq.Expressions;
using System.Threading;
using System.Threading.Tasks;
using MongoDB.Driver;
using SIL.XForge.Models;

namespace SIL.XForge.DataAccess;

public class MongoRepository<T>(IMongoCollection<T> collection, Action<IMongoCollection<T>> init) : IRepository<T>
    where T : IIdentifiable
{
    public void Init() => init(collection);

    public IQueryable<T> Query() => collection.AsQueryable();

    public async Task InsertAsync(T entity, CancellationToken cancellationToken = default)
    {
        try
        {
            await collection.InsertOneAsync(entity, options: null, cancellationToken);
        }
        catch (MongoWriteException e)
        {
            if (e.WriteError.Category == ServerErrorCategory.DuplicateKey)
                throw new DuplicateKeyException(e);
            throw;
        }
    }

    public async Task<bool> ReplaceAsync(T entity, bool upsert = false, CancellationToken cancellationToken = default)
    {
        try
        {
            ReplaceOneResult result = await collection.ReplaceOneAsync(
                e => e.Id == entity.Id,
                entity,
                new ReplaceOptions { IsUpsert = upsert },
                cancellationToken
            );
            if (result.IsAcknowledged)
                return upsert || result.MatchedCount > 0;
            return false;
        }
        catch (MongoWriteException e)
        {
            if (e.WriteError.Category == ServerErrorCategory.DuplicateKey)
                throw new DuplicateKeyException();
            throw;
        }
    }

    public async Task<T> UpdateAsync(
        Expression<Func<T, bool>> filter,
        Action<IUpdateBuilder<T>> update,
        bool upsert = false,
        CancellationToken cancellationToken = default
    )
    {
        try
        {
            var updateBuilder = new MongoUpdateBuilder<T>();
            update(updateBuilder);
            UpdateDefinition<T> updateDef = updateBuilder.Build();
            return await collection.FindOneAndUpdateAsync(
                filter,
                updateDef,
                new FindOneAndUpdateOptions<T> { IsUpsert = upsert, ReturnDocument = ReturnDocument.After },
                cancellationToken
            );
        }
        catch (MongoWriteException e)
        {
            if (e.WriteError.Category == ServerErrorCategory.DuplicateKey)
                throw new DuplicateKeyException();
            throw;
        }
    }

    public Task<T> DeleteAsync(Expression<Func<T, bool>> filter, CancellationToken cancellationToken = default) =>
        collection.FindOneAndDeleteAsync(filter, options: null, cancellationToken);

    public async Task<long> DeleteAllAsync(
        Expression<Func<T, bool>> filter,
        CancellationToken cancellationToken = default
    )
    {
        DeleteResult result = await collection.DeleteManyAsync(filter, cancellationToken);
        return result.DeletedCount;
    }

    public Task<long> CountDocumentsAsync(
        Expression<Func<T, bool>> filter,
        CancellationToken cancellationToken = default
    ) => collection.CountDocumentsAsync(filter, options: null, cancellationToken);
}
