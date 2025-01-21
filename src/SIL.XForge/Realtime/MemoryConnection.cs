using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Threading.Tasks;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;

namespace SIL.XForge.Realtime;

public class MemoryConnection : IConnection
{
    /// <summary>
    /// Gets a value of the last hour, for use with op generation.
    /// </summary>
    private readonly DateTime _thePreviousHour = new DateTime(
        DateTime.UtcNow.Year,
        DateTime.UtcNow.Month,
        DateTime.UtcNow.Day,
        DateTime.UtcNow.Hour,
        0,
        0,
        DateTimeKind.Utc
    );
    private readonly MemoryRealtimeService _realtimeService;
    private readonly Dictionary<(string, string), object> _documents;

    internal MemoryConnection(MemoryRealtimeService realtimeService)
    {
        _realtimeService = realtimeService;
        _documents = [];
    }

    /// <summary>
    /// Begins the transaction.
    /// </summary>
    /// <returns>
    /// A null value.
    /// </returns>
    /// <remarks>
    /// The <see cref="MemoryConnection" /> does not support transactions.
    /// No exception is thrown for compatibility reasons.
    /// </remarks>
    public void BeginTransaction() { }

    /// <summary>
    /// Commits the transaction.
    /// </summary>
    /// <remarks>
    /// The <see cref="MemoryConnection" /> does not support transactions.
    /// No exception is thrown for compatibility reasons.
    /// </remarks>
    public Task CommitTransactionAsync() => Task.CompletedTask;

    /// <summary>
    /// Creates a document asynchronously.
    /// </summary>
    /// <exception cref="NotImplementedException">
    /// This is not supported by a <see cref="MemoryConnection" />.
    /// </exception>
    public Task<Snapshot<T>> CreateDocAsync<T>(string collection, string id, T data, string otTypeName) =>
        throw new NotImplementedException();

    /// <summary>
    /// Deletes a document asynchronously.
    /// </summary>
    /// <exception cref="NotImplementedException">
    /// This is not supported by a <see cref="MemoryConnection" />.
    /// </exception>
    public Task DeleteDocAsync(string collection, string id) => throw new NotImplementedException();

    public void Dispose() => GC.SuppressFinalize(this);

    public ValueTask DisposeAsync()
    {
        GC.SuppressFinalize(this);
        return ValueTask.CompletedTask;
    }

    /// <summary>
    /// Excludes the field from the transaction.
    /// </summary>
    /// <typeparam name="T">The type.</typeparam>
    /// <param name="field">The field.</param>
    /// <remarks>
    /// The <see cref="MemoryConnection" /> does not support transactions.
    /// </remarks>
    public void ExcludePropertyFromTransaction<T>(Expression<Func<T, object>> field) { }

    /// <summary>
    /// Fetches a document asynchronously.
    /// </summary>
    /// <exception cref="NotImplementedException">
    /// This is not supported by a <see cref="MemoryConnection" />.
    /// </exception>
    public Task<Snapshot<T>> FetchDocAsync<T>(string collection, string id) => throw new NotImplementedException();

    /// <summary>
    /// Fetches a document snapshot at a point in time asynchronously.
    /// </summary>
    public async Task<Snapshot<T>> FetchSnapshotAsync<T>(string id, DateTime timestamp)
        where T : IIdentifiable
    {
        var doc = Get<T>(id);
        await doc.FetchAsync();
        return new Snapshot<T>
        {
            Data = doc.Data,
            Id = doc.Id,
            Version = doc.Version,
        };
    }

    /// <summary>
    /// Gets the ops for a document.
    /// </summary>
    /// <returns>A default Op array for test purposes.</returns>
    public Task<Op[]> GetOpsAsync<T>(string id)
        where T : IIdentifiable =>
        Task.FromResult(
            new Op[]
            {
                new Op
                {
                    Metadata = new OpMetadata { Timestamp = _thePreviousHour.AddMinutes(-30) },
                    Version = 1,
                },
                new Op
                {
                    Metadata = new OpMetadata { Timestamp = _thePreviousHour.AddMinutes(-10) },
                    Version = 2,
                },
                new Op
                {
                    // This op should be combined with the next
                    Metadata = new OpMetadata { Timestamp = _thePreviousHour.AddMinutes(-1) },
                    Version = 3,
                },
                new Op
                {
                    Metadata = new OpMetadata
                    {
                        Timestamp = _thePreviousHour,
                        UserId = "user01",
                        Source = OpSource.Draft,
                    },
                    Version = 4,
                },
            }
        );

    public IDocument<T> Get<T>(string id)
        where T : IIdentifiable
    {
        DocConfig docConfig = _realtimeService.GetDocConfig<T>();
        if (_documents.TryGetValue((docConfig.CollectionName, id), out object docObj))
            return (IDocument<T>)docObj;

        MemoryRepository<T> repo = _realtimeService.GetRepository<T>();
        IDocument<T> doc = new MemoryDocument<T>(repo, docConfig.OTTypeName, docConfig.CollectionName, id);
        _documents[(docConfig.CollectionName, id)] = doc;
        return doc;
    }

    public async Task<IReadOnlyCollection<IDocument<T>>> GetAndFetchDocsAsync<T>(IReadOnlyCollection<string> ids)
        where T : IIdentifiable
    {
        List<IDocument<T>> docs = [];
        foreach (IDocument<T> doc in ids.Select(Get<T>))
        {
            await doc.FetchAsync();
            if (doc.IsLoaded)
            {
                docs.Add(doc);
            }
        }

        return docs;
    }

    /// <summary>
    /// Rolls back the transaction.
    /// </summary>
    /// <remarks>
    /// The <see cref="MemoryConnection" /> does not support transactions.
    /// </remarks>
    public void RollbackTransaction() { }

    /// <summary>
    /// Submits an operation asynchronously.
    /// </summary>
    /// <exception cref="NotImplementedException">
    /// This is not supported by a <see cref="MemoryConnection" />.
    /// </exception>
    public Task<Snapshot<T>> SubmitOpAsync<T>(
        string collection,
        string id,
        object op,
        T currentDoc,
        int currentVersion,
        OpSource? source
    ) => throw new NotImplementedException();
}
