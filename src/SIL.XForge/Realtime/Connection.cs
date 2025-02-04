using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq.Expressions;
using System.Threading.Tasks;
using SIL.ObjectModel;
using SIL.XForge.Configuration;
using SIL.XForge.Models;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Utils;

namespace SIL.XForge.Realtime;

/// <summary>
/// This class represents a connection with the real-time server.
/// </summary>
public class Connection : DisposableBase, IConnection
{
    /// <summary>
    /// The documents cache.
    /// </summary>
    private readonly ConcurrentDictionary<(string, string), object>? _documents;

    /// <summary>
    /// The properties to excluded from the transaction (i.e. to commit immediately).
    /// </summary>
    /// <remarks>
    /// These are in the form "Type.Property.Property", in lower case.
    /// </remarks>
    private readonly List<string> _excludedProperties = [];

    /// <summary>
    /// The connection handle.
    /// </summary>
    private int _handle;

    /// <summary>
    /// Whether or not this connection is in a transaction state.
    /// </summary>
    private bool _isTransaction;

    /// <summary>
    /// The queued operations.
    /// </summary>
    private readonly ConcurrentQueue<QueuedOperation> _queuedOperations = new ConcurrentQueue<QueuedOperation>();

    /// <summary>
    /// The realtime server to create/modify documents with.
    /// </summary>
    private readonly IRealtimeServer _realtimeServer;

    /// <summary>
    /// The realtime service to use for this connection.
    /// </summary>
    private readonly RealtimeService _realtimeService;

    /// <summary>
    /// Initializes a new instance of the <see cref="Connection"/> class.
    /// </summary>
    /// <param name="realtimeService">The realtime service.</param>
    /// <param name="documentCacheDisabled">If <c>true</c>, disable the document cache.</param>
    internal Connection(RealtimeService realtimeService, bool documentCacheDisabled)
    {
        _realtimeService = realtimeService;
        _realtimeServer = realtimeService.Server;
        if (!documentCacheDisabled)
        {
            _documents = new ConcurrentDictionary<(string, string), object>();
        }
    }

    /// <summary>
    /// Gets the excluded properties.
    /// </summary>
    /// <value>
    /// The excluded properties.
    /// </value>
    /// <remarks>
    /// This is for unit test verification or debugging.
    /// </remarks>
    internal IReadOnlyCollection<string> ExcludedProperties => _excludedProperties;

    /// <summary>
    /// Gets the number of queued operations.
    /// </summary>
    /// <value>
    /// The number of operations in the queue.
    /// </value>
    /// <remarks>
    /// This is for unit test verification or debugging.
    /// </remarks>
    internal IReadOnlyCollection<QueuedOperation> QueuedOperations => _queuedOperations;

    /// <summary>
    /// Begins the transaction.
    /// </summary>
    /// <exception cref="ArgumentException">The connection is already in a transaction state.</exception>
    public void BeginTransaction()
    {
        // Start the transaction state, if we are not in a transaction state
        if (!_isTransaction)
        {
            _isTransaction = true;
        }
        else
        {
            // We are already in a transaction state
            throw new ArgumentException("The connection is already in a transaction state.");
        }
    }

    /// <summary>
    /// Commits the transaction.
    /// </summary>
    /// <exception cref="ArgumentException">The connection is not in a transaction state.</exception>
    public async Task CommitTransactionAsync()
    {
        if (_isTransaction)
        {
            // Execute the queued operations
            while (_queuedOperations.TryDequeue(out QueuedOperation queuedOperation))
            {
                switch (queuedOperation.Action)
                {
                    case QueuedAction.Create:
                        await _realtimeServer.CreateDocAsync(
                            queuedOperation.Handle,
                            queuedOperation.Collection,
                            queuedOperation.Id,
                            queuedOperation.Data,
                            queuedOperation.OtTypeName
                        );
                        break;
                    case QueuedAction.Delete:
                        await _realtimeServer.DeleteDocAsync(
                            queuedOperation.Handle,
                            queuedOperation.Collection,
                            queuedOperation.Id
                        );
                        break;
                    case QueuedAction.Submit:
                        await _realtimeServer.SubmitOpAsync<object>(
                            queuedOperation.Handle,
                            queuedOperation.Collection,
                            queuedOperation.Id,
                            queuedOperation.Op,
                            queuedOperation.Source
                        );
                        break;
                    case QueuedAction.Replace:
                        await _realtimeServer.ReplaceDocAsync(
                            queuedOperation.Handle,
                            queuedOperation.Collection,
                            queuedOperation.Id,
                            queuedOperation.Data,
                            queuedOperation.Source
                        );
                        break;
                }
            }

            // Clear the excluded operations, and reset the transaction state
            _excludedProperties.Clear();
            _isTransaction = false;
        }
        else
        {
            // We are not in a transaction state
            throw new ArgumentException("The connection is not in a transaction state.");
        }
    }

    /// <summary>
    /// Creates a document asynchronously.
    /// </summary>
    /// <typeparam name="T">The document type.</typeparam>
    /// <param name="collection">The collection.</param>
    /// <param name="id">The identifier.</param>
    /// <param name="data">The data.</param>
    /// <param name="otTypeName">Name of the OT type.</param>
    /// <returns>
    /// A snapshot of the created document from the realtime server.
    /// </returns>
    public async Task<Snapshot<T>> CreateDocAsync<T>(string collection, string id, T data, string otTypeName)
    {
        if (_isTransaction)
        {
            // Queue this operation
            _queuedOperations.Enqueue(
                new QueuedOperation
                {
                    Action = QueuedAction.Create,
                    Collection = collection,
                    Data = data,
                    Handle = _handle,
                    Id = id,
                    OtTypeName = otTypeName,
                }
            );

            // Return a snapshot
            return new Snapshot<T> { Data = data, Version = 1 };
        }
        else
        {
            return await _realtimeServer.CreateDocAsync(_handle, collection, id, data, otTypeName);
        }
    }

    /// <summary>
    /// Deletes a document asynchronously.
    /// </summary>
    /// <param name="collection">The collection.</param>
    /// <param name="id">The identifier.</param>
    /// <returns>The task.</returns>
    public async Task DeleteDocAsync(string collection, string id)
    {
        if (_isTransaction)
        {
            // Queue this operation
            _queuedOperations.Enqueue(
                new QueuedOperation
                {
                    Action = QueuedAction.Delete,
                    Collection = collection,
                    Handle = _handle,
                    Id = id,
                }
            );
        }
        else
        {
            await _realtimeServer.DeleteDocAsync(_handle, collection, id);
        }
    }

    /// <summary>
    /// Excludes a property from the transaction.
    /// </summary>
    /// <typeparam name="T">The type the field belongs to.</typeparam>
    /// <param name="field">The property field.</param>
    /// <exception cref="ArgumentException">The connection is not in a transaction state.</exception>
    /// <remarks>
    /// Notes:
    ///  - When a field is excluded from a transaction, operations to it are committed immediately.
    ///  - Any operations lists that contain an excluded property will all be committed immediately.
    ///  - You will need to call this again if you begin a new transaction.
    ///  - This only applies to JSON0 operations.
    /// </remarks>
    public void ExcludePropertyFromTransaction<T>(Expression<Func<T, object>> field)
    {
        if (_isTransaction)
        {
            // Exclude the property, if we are in a transaction state
            string excluded = (typeof(T).Name + "." + string.Join('.', new ObjectPath(field).Items)).ToLowerInvariant();
            _excludedProperties.Add(excluded);
        }
        else
        {
            // We are not in a transaction state
            throw new ArgumentException("The connection is not in a transaction state.");
        }
    }

    /// <summary>
    /// Fetches a document asynchronously.
    /// </summary>
    /// <typeparam name="T">The document type.</typeparam>
    /// <param name="collection">The collection.</param>
    /// <param name="id">The identifier.</param>
    /// <returns>
    /// A snapshot of the fetched document from the realtime server.
    /// </returns>
    public async Task<Snapshot<T>> FetchDocAsync<T>(string collection, string id) =>
        await _realtimeServer.FetchDocAsync<T>(_handle, collection, id);

    /// <summary>
    /// Fetches a document snapshot at the specified timestamp asynchronously.
    /// </summary>
    /// <typeparam name="T">The document type.</typeparam>
    /// <param name="id">The identifier.</param>
    /// <param name="timestamp">The timestamp.</param>
    /// <returns>
    /// A snapshot of the fetched document from the realtime server.
    /// </returns>
    public async Task<Snapshot<T>> FetchSnapshotAsync<T>(string id, DateTime timestamp)
        where T : IIdentifiable
    {
        DocConfig docConfig = _realtimeService.GetDocConfig<T>();
        return await _realtimeServer.FetchSnapshotAsync<T>(_handle, docConfig.CollectionName, id, timestamp);
    }

    /// <summary>
    /// Gets all the ops for the specified document.
    /// </summary>
    /// <typeparam name="T">The document type.</typeparam>
    /// <param name="id">The identifier.</param>
    /// <returns>
    /// The ops for the document from the realtime server.
    /// </returns>
    public async Task<Op[]> GetOpsAsync<T>(string id)
        where T : IIdentifiable
    {
        DocConfig docConfig = _realtimeService.GetDocConfig<T>();
        return await _realtimeServer.GetOpsAsync(docConfig.CollectionName, id);
    }

    /// <summary>
    /// Gets the specified document, bound to the current realtime server.
    /// </summary>
    /// <typeparam name="T">The document type.</typeparam>
    /// <param name="id">The identifier.</param>
    /// <returns>
    /// The document.
    /// </returns>
    public IDocument<T> Get<T>(string id)
        where T : IIdentifiable
    {
        DocConfig docConfig = _realtimeService.GetDocConfig<T>();
        if (_documents is null)
        {
            return GetDocument<T>(id, docConfig);
        }

        object doc = _documents.GetOrAdd((docConfig.CollectionName, id), _ => GetDocument<T>(id, docConfig));
        return (Document<T>)doc;
    }

    public async Task<IReadOnlyCollection<IDocument<T>>> GetAndFetchDocsAsync<T>(IReadOnlyCollection<string> ids)
        where T : IIdentifiable
    {
        if (ids.Count == 0)
        {
            return new List<IDocument<T>>();
        }

        DocConfig docConfig = _realtimeService.GetDocConfig<T>();
        List<IDocument<T>> docs = new List<IDocument<T>>(ids.Count);
        Snapshot<T>[] snapshots = await _realtimeServer.FetchDocsAsync<T>(_handle, docConfig.CollectionName, ids);
        foreach (Snapshot<T> snapshot in snapshots)
        {
            IDocument<T> doc = _documents is null
                ? GetDocument(snapshot.Id, docConfig, snapshot)
                : (IDocument<T>)
                    _documents.GetOrAdd(
                        (docConfig.CollectionName, snapshot.Id),
                        _ => GetDocument(snapshot.Id, docConfig, snapshot)
                    );

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
    /// <exception cref="ArgumentException">The connection is not in a transaction state.</exception>
    public void RollbackTransaction()
    {
        if (_isTransaction)
        {
            // Clear the operations
            _excludedProperties.Clear();
            _queuedOperations.Clear();

            // Reset the transaction state
            _isTransaction = false;
        }
        else
        {
            // We are not in a transaction state
            throw new ArgumentException("The connection is not in a transaction state.");
        }
    }

    /// <summary>
    /// Submits an operation asynchronously.
    /// </summary>
    /// <typeparam name="T">The document type.</typeparam>
    /// <param name="collection">The collection.</param>
    /// <param name="id">The identifier.</param>
    /// <param name="op">The operation.</param>
    /// <param name="currentDoc">The current document (only used when in a transaction).</param>
    /// <param name="currentVersion">The current version (only used when in a transaction).</param>
    /// <param name="source">The source of the op. This is currently only used by text documents.</param>
    /// <returns>
    /// A snapshot of the document with the submitted operation from the realtime server.
    /// </returns>
    public async Task<Snapshot<T>> SubmitOpAsync<T>(
        string collection,
        string id,
        object op,
        T currentDoc,
        int currentVersion,
        OpSource? source
    )
    {
        if (_isTransaction)
        {
            // If we have a collection of JSON0 operations, see if any are to be committed immediately
            bool queueOperation = true;
            if (_excludedProperties.Count > 0 && op is IEnumerable<Json0Op> jsonOps)
            {
                foreach (Json0Op jsonOp in jsonOps)
                {
                    string path = (typeof(T).Name + "." + string.Join('.', jsonOp.Path)).ToLowerInvariant();
                    if (_excludedProperties.Contains(path))
                    {
                        // Do not return the submitted operation, as it will not include the queued ops,
                        // as SubmitOpAsync writes to then reads directly from the Realtime Server.
                        _ = await _realtimeServer.SubmitOpAsync<T>(_handle, collection, id, op, source);
                        queueOperation = false;
                        break;
                    }
                }
            }

            // Queue this operation
            if (queueOperation)
            {
                _queuedOperations.Enqueue(
                    new QueuedOperation
                    {
                        Action = QueuedAction.Submit,
                        Collection = collection,
                        Handle = _handle,
                        Id = id,
                        Op = op,
                        Source = source,
                    }
                );
            }

            // Return the operation applied to the object
            string otTypeName = op is IEnumerable<Json0Op> or Json0Op ? OTType.Json0 : OTType.RichText;
            return new Snapshot<T>
            {
                Data = await _realtimeServer.ApplyOpAsync(otTypeName, currentDoc, op),
                Version = ++currentVersion,
            };
        }

        return await _realtimeServer.SubmitOpAsync<T>(_handle, collection, id, op, source);
    }

    /// <summary>
    /// Replaces a document asynchronously.
    /// </summary>
    /// <typeparam name="T">The document type.</typeparam>
    /// <param name="collection">The collection.</param>
    /// <param name="id">The identifier.</param>
    /// <param name="data">The replacement data.</param>
    /// <param name="currentVersion">The current version (only used when in a transaction).</param>
    /// <param name="source">The source of the op. This is currently only used by text_document documents.</param>
    /// <returns>
    /// A snapshot of the updated document.
    /// </returns>
    /// <remarks>Only for use with JSON0 documents. This will generate the ops in the realtime server.</remarks>
    public async Task<Snapshot<T>> ReplaceDocAsync<T>(
        string collection,
        string id,
        T data,
        int currentVersion,
        OpSource? source
    )
    {
        ArgumentNullException.ThrowIfNull(data);
        if (_isTransaction)
        {
            // Queue this operation
            _queuedOperations.Enqueue(
                new QueuedOperation
                {
                    Action = QueuedAction.Replace,
                    Collection = collection,
                    Data = data,
                    Handle = _handle,
                    Id = id,
                    Source = source,
                }
            );

            // Return a snapshot
            return new Snapshot<T>
            {
                Data = data,
                Id = id,
                Version = ++currentVersion,
            };
        }

        // Outside a transaction
        return await _realtimeServer.ReplaceDocAsync(_handle, collection, id, data, source);
    }

    public async ValueTask DisposeAsync()
    {
        await _realtimeService.Server.DisconnectAsync(_handle);
        GC.SuppressFinalize(this);
    }

    /// <summary>
    /// Starts the realtime server asynchronously.
    /// </summary>
    /// <param name="userId">The user identifier.</param>
    internal async Task StartAsync(string userId = null) =>
        _handle = await _realtimeService.Server.ConnectAsync(userId);

    /// <summary>
    /// Disposes the managed resources.
    /// </summary>
    protected override void DisposeManagedResources() => _realtimeService.Server.Disconnect(_handle);

    private Document<T> GetDocument<T>(string id, DocConfig docConfig, Snapshot<T>? snapshot = null)
        where T : IIdentifiable
    {
        string otTypeName = docConfig.OTTypeName;
        return new Document<T>(this, otTypeName, docConfig.CollectionName, id, snapshot);
    }
}
