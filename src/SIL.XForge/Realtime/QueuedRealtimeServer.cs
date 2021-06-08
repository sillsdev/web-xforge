using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Threading;
using System.Threading.Tasks;
using SIL.XForge.Models;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Utils;

namespace SIL.XForge.Realtime
{
    /// <summary>
    /// A realtime server implementation that queues all actions.
    /// </summary>
    public class QueuedRealtimeServer : IRealtimeServer
    {
        /// <summary>
        /// The properties to excluded from the transaction (i.e. to commit immediately).
        /// </summary>
        /// <remarks>
        /// These are in the form "Type.Property.Property", in lower case.
        /// </remarks>
        private List<string> _excludedProperties = new List<string>();

        /// <summary>
        /// The lock to ensure that the queue is not modified during commit or out of sequence.
        /// </summary>
        private readonly SemaphoreSlim _lock = new SemaphoreSlim(1, 1);

        /// <summary>
        /// The queued operations.
        /// </summary>
        private List<QueuedOperation> _queuedOperations = new List<QueuedOperation>();

        /// <summary>
        /// The realtime server that will perform the queued operations when committed.
        /// </summary>
        private IRealtimeServer _realtimeServer;

        /// <summary>
        /// Initializes a new instance of the <see cref="QueuedRealtimeServer"/> class.
        /// </summary>
        /// <param name="realtimeServer">The realtime server that the queued operations will be written to.</param>
        public QueuedRealtimeServer(IRealtimeServer realtimeServer)
        {
            _realtimeServer = realtimeServer;
        }

        public async Task<T> ApplyOpAsync<T>(string otTypeName, T data, object op)
        {
            return await _realtimeServer.ApplyOpAsync(otTypeName, data, op);
        }

        public async Task<int> ConnectAsync(string userId = null)
        {
            return await _realtimeServer.ConnectAsync(userId);
        }

        public async Task<Snapshot<T>> CreateDocAsync<T>(int handle, string collection, string id, T data, string otTypeName)
        {
            await _lock.WaitAsync();
            try
            {
                // Queue this operation
                _queuedOperations.Add(new QueuedOperation
                {
                    Action = QueuedAction.Create,
                    Collection = collection,
                    Data = data,
                    Handle = handle,
                    Id = id,
                    OtTypeName = otTypeName,
                });
            }
            finally
            {
                _lock.Release();
            }

            // Return a snapshot
            return new Snapshot<T>
            {
                Data = data,
                Version = 1,
            };
        }

        public async Task DeleteDocAsync(int handle, string collection, string id)
        {
            await _lock.WaitAsync();
            try
            {
                // Queue this operation
                _queuedOperations.Add(new QueuedOperation
                {
                    Action = QueuedAction.Delete,
                    Collection = collection,
                    Handle = handle,
                    Id = id,
                });
            }
            finally
            {
                _lock.Release();
            }
        }

        public void Disconnect(int handle)
        {
            _realtimeServer.Disconnect(handle);
        }

        public async Task<Snapshot<T>> FetchDocAsync<T>(int handle, string collection, string id)
        {
            return await _realtimeServer.FetchDocAsync<T>(handle, collection, id);
        }

        public void Start(object options)
        {
            _realtimeServer.Start(options);
        }

        public void Stop()
        {
            _realtimeServer.Stop();
        }

        public async Task<Snapshot<T>> SubmitOpAsync<T>(int handle, string collection, string id, object op)
        {
            await _lock.WaitAsync();
            try
            {
                // If we have a collection of JSON0 operations, see if any are to be committed immediately
                if (_excludedProperties.Any() && op is IEnumerable<Json0Op> jsonOps)
                {
                    foreach (Json0Op jsonOp in jsonOps)
                    {
                        string path = (typeof(T).Name + "." + string.Join('.', jsonOp.Path)).ToLowerInvariant();
                        if (_excludedProperties.Contains(path))
                        {
                            return await _realtimeServer.SubmitOpAsync<T>(handle, collection, id, op);
                        }
                    }
                }

                // Queue this operation
                _queuedOperations.Add(new QueuedOperation
                {
                    Action = QueuedAction.Submit,
                    Collection = collection,
                    Handle = handle,
                    Id = id,
                    Op = op,
                });
            }
            finally
            {
                _lock.Release();
            }

            // Return the operation applied to the object
            Snapshot<T> snapshot = await FetchDocAsync<T>(handle, collection, id);
            string otTypeName = op is IEnumerable<Json0Op> || op is Json0Op ? OTType.Json0 : OTType.RichText;
            snapshot.Data = await ApplyOpAsync(otTypeName, snapshot.Data, op);
            return snapshot;
        }

        /// <summary>
        /// Cleats the operations.
        /// </summary>
        /// <remarks>
        /// This should only be called by the appropriate connection.
        /// The excluded properties are cleared as well.
        /// </remarks>
        internal async Task ClearOperationsAsync()
        {
            await _lock.WaitAsync();
            try
            {
                _excludedProperties.Clear();
                _queuedOperations.Clear();
            }
            finally
            {
                _lock.Release();
            }
        }

        /// <summary>
        /// Excludes a property field from the transaction.
        /// </summary>
        /// <typeparam name="T">The type the field belongs to.</typeparam>
        /// <param name="op">The property field.</param>
        /// <remarks>
        /// When a field is excluded from a transaction, operations to it are committed immediately.
        /// Any operations lists that contain an excluded property will all be committed immediately.
        /// This only applies to JSON0 operations.
        /// </remarks>
        internal void ExcludePropertyFromTransaction<T>(LambdaExpression field)
        {
            string excluded = (typeof(T).Name + "." + string.Join('.', new ObjectPath(field).Items)).ToLowerInvariant();
            _excludedProperties.Add(excluded);
        }

        /// <summary>
        /// Submits the operations.
        /// </summary>
        /// <remarks>
        /// This should only be called by the appropriate connection.
        /// </remarks>
        internal async Task SubmitOperationsAsync()
        {
            await _lock.WaitAsync();
            try
            {
                // Execute the queued operations
                foreach (QueuedOperation queuedOperation in _queuedOperations)
                {
                    switch (queuedOperation.Action)
                    {
                        case QueuedAction.Create:
                            await _realtimeServer.CreateDocAsync(queuedOperation.Handle, queuedOperation.Collection,
                                queuedOperation.Id, queuedOperation.Data, queuedOperation.OtTypeName);
                            break;
                        case QueuedAction.Delete:
                            await _realtimeServer.DeleteDocAsync(queuedOperation.Handle, queuedOperation.Collection,
                                queuedOperation.Id);
                            break;
                        case QueuedAction.Submit:
                            await _realtimeServer.SubmitOpAsync<object>(queuedOperation.Handle,
                                queuedOperation.Collection, queuedOperation.Id, queuedOperation.Op);
                            break;
                    }
                }

                // Clear the queued operations
                _queuedOperations.Clear();
            }
            finally
            {
                _lock.Release();
            }
        }
    }
}
