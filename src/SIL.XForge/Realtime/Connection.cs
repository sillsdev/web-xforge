using System;
using System.Collections.Concurrent;
using System.Linq.Expressions;
using System.Threading.Tasks;
using SIL.ObjectModel;
using SIL.XForge.Configuration;
using SIL.XForge.Models;

namespace SIL.XForge.Realtime
{
    /// <summary>
    /// This class represents a connection with the real-time server.
    /// </summary>
    public class Connection : DisposableBase, IConnection
    {
        /// <summary>
        /// The documents cache.
        /// </summary>
        private readonly ConcurrentDictionary<(string, string), object> _documents;

        /// <summary>
        /// The connection handle.
        /// </summary>
        private int _handle;

        /// <summary>
        /// Whether or not this connection is in a transaction state.
        /// </summary>
        private bool _isTransaction;

        /// <summary>
        /// The realtime server to create/modify documents with.
        /// </summary>
        private IRealtimeServer _realtimeServer;

        /// <summary>
        /// The queued realtime server to handle transactions.
        /// </summary>
        private QueuedRealtimeServer _queuedRealtimeServer;

        /// <summary>
        /// The realtime service to use for this connection.
        /// </summary>
        private readonly RealtimeService _realtimeService;

        /// <summary>
        /// Initializes a new instance of the <see cref="Connection"/> class.
        /// </summary>
        /// <param name="realtimeService">The realtime service.</param>
        internal Connection(RealtimeService realtimeService)
        {
            _realtimeService = realtimeService;
            _realtimeServer = realtimeService.Server;
            _queuedRealtimeServer = new QueuedRealtimeServer(_realtimeService.Server);
            _documents = new ConcurrentDictionary<(string, string), object>();
        }

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
                // Submit the operations
                await _queuedRealtimeServer.SubmitOperationsAsync();

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
                return await _queuedRealtimeServer.CreateDocAsync(_handle, collection, id, data, otTypeName);
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
                await _queuedRealtimeServer.DeleteDocAsync(_handle, collection, id);
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
                _queuedRealtimeServer.ExcludePropertyFromTransaction(field);
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
        public async Task<Snapshot<T>> FetchDocAsync<T>(string collection, string id)
        {
            return await _realtimeServer.FetchDocAsync<T>(_handle, collection, id);
        }

        /// <summary>
        /// Gets the specified document, bound to the current realtime server.
        /// </summary>
        /// <typeparam name="T">The document type.</typeparam>
        /// <param name="id">The identifier.</param>
        /// <returns>
        /// The document.
        /// </returns>
        public IDocument<T> Get<T>(string id) where T : IIdentifiable
        {
            DocConfig docConfig = _realtimeService.GetDocConfig<T>();
            object doc = _documents.GetOrAdd((docConfig.CollectionName, id), key =>
            {
                string otTypeName = docConfig.OTTypeName;
                return new Document<T>(this, otTypeName, docConfig.CollectionName, id);
            });
            return (Document<T>)doc;
        }

        /// <summary>
        /// Rolls back the transaction.
        /// </summary>
        /// <exception cref="ArgumentException">The connection is not in a transaction state.</exception>
        public async Task RollbackTransactionAsync()
        {
            if (_isTransaction)
            {
                // Clear the operations
                await _queuedRealtimeServer.ClearOperationsAsync();

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
        /// <returns>
        /// A snapshot of the document with the submitted operation from the realtime server.
        /// </returns>
        public async Task<Snapshot<T>> SubmitOpAsync<T>(string collection, string id, object op)
        {
            if (_isTransaction)
            {
                return await _queuedRealtimeServer.SubmitOpAsync<T>(_handle, collection, id, op);
            }
            else
            {
                return await _realtimeServer.SubmitOpAsync<T>(_handle, collection, id, op);
            }
        }

        /// <summary>
        /// Starts the realtime server asynchronously.
        /// </summary>
        /// <param name="userId">The user identifier.</param>
        internal async Task StartAsync(string userId = null)
        {
            _handle = await _realtimeService.Server.ConnectAsync(userId);
        }

        /// <summary>
        /// Disposes the managed resources.
        /// </summary>
        protected override void DisposeManagedResources()
        {
            _realtimeService.Server.Disconnect(_handle);
        }
    }
}
