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
        /// The realtime service to use for this connection.
        /// </summary>
        private readonly RealtimeService _realtimeService;

        internal Connection(RealtimeService realtimeService)
        {
            this._realtimeService = realtimeService;
            this._realtimeServer = realtimeService.Server;
            this._documents = new ConcurrentDictionary<(string, string), object>();
        }

        /// <summary>
        /// Begins the transaction.
        /// </summary>
        /// <returns>
        /// The realtime server that will queue the operations for the transaction.
        /// </returns>
        /// <exception cref="ArgumentException">
        /// The connection is in a transaction state but cannot queue operations.
        /// </exception>
        /// <remarks>
        /// You should <see cref="Get{T}(string)" /> documents after calling this method,
        /// if you want to use them in the transaction.
        /// </remarks>
        public IRealtimeServer BeginTransaction()
        {
            // Create the transaction state, if we are not in a transaction state
            if (!this._isTransaction)
            {
                // Create a queued realtime server to queue operations for committing later
                // We must clear the documents cache so each document has the correct server
                this._documents.Clear();
                this._realtimeServer = new QueuedRealtimeServer(this._realtimeService.Server);
                this._isTransaction = true;
                return this._realtimeServer;
            }
            else if (this._realtimeServer is QueuedRealtimeServer realtimeServer)
            {
                // Return the queued realtime server
                return realtimeServer;
            }
            else
            {
                // We are in a mixed state
                throw new ArgumentException("The connection is in a transaction state but cannot queue operations");
            }
        }

        /// <summary>
        /// Commits the transaction.
        /// </summary>
        /// <exception cref="ArgumentException">The connection is not in a transaction state</exception>
        public async Task CommitTransactionAsync()
        {
            if (this._realtimeServer is QueuedRealtimeServer realtimeServer)
            {
                // Submit the operations
                await realtimeServer.SubmitOperationsAsync();

                // Clear the documents cache and reset the transaction state
                this._documents.Clear();
                this._isTransaction = false;
                this._realtimeServer = this._realtimeService.Server;
            }
            else
            {
                // We are not in a transaction state
                throw new ArgumentException("The connection is not in a transaction state");
            }
        }

        /// <summary>
        /// Excludes a property from the transaction.
        /// </summary>
        /// <typeparam name="T">The type the field belongs to.</typeparam>
        /// <param name="op">The property field.</param>
        /// <remarks>
        /// When a field is excluded from a transaction, operations to it are committed immediately.
        /// Any operations lists that contain an excluded property will all be committed immediately.
        /// This only applies to JSON0 operations.
        /// </remarks>
        public void ExcludePropertyFromTransaction<T>(Expression<Func<T, object>> field)
        {
            if (this._realtimeServer is QueuedRealtimeServer realtimeServer)
            {
                // Exclude the property
                realtimeServer.ExcludePropertyFromTransaction(field);
            }
            else
            {
                // We are not in a transaction state
                throw new ArgumentException("The connection is not in a transaction state");
            }
        }

        /// <summary>
        /// Rolls back the transaction.
        /// </summary>
        /// <exception cref="ArgumentException">The connection is not in a transaction state</exception>
        public async Task RollbackTransactionAsync()
        {
            if (this._realtimeServer is QueuedRealtimeServer realtimeServer)
            {
                // Clear the operations
                await realtimeServer.ClearOperationsAsync();

                // Clear the documents cache and reset the transaction state
                this._documents.Clear();
                this._isTransaction = false;
                this._realtimeServer = this._realtimeService.Server;
            }
            else
            {
                // We are not in a transaction state
                throw new ArgumentException("The connection is not in a transaction state");
            }
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
            DocConfig docConfig = this._realtimeService.GetDocConfig<T>();
            object doc = this._documents.GetOrAdd((docConfig.CollectionName, id), key =>
            {
                string otTypeName = docConfig.OTTypeName;
                return new Document<T>(this._realtimeServer, this._handle, otTypeName, docConfig.CollectionName, id);
            });
            return (Document<T>)doc;
        }

        /// <summary>
        /// Starts the realtime server asynchronously.
        /// </summary>
        /// <param name="userId">The user identifier.</param>
        internal async Task StartAsync(string userId = null)
        {
            this._handle = await this._realtimeService.Server.ConnectAsync(userId);
        }

        /// <summary>
        /// Disposes the managed resources.
        /// </summary>
        protected override void DisposeManagedResources()
        {
            this._realtimeService.Server.Disconnect(this._handle);
        }
    }
}
