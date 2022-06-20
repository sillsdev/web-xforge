using System;
using System.Collections.Generic;
using System.Linq.Expressions;
using System.Threading.Tasks;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;

namespace SIL.XForge.Realtime
{
    public class MemoryConnection : IConnection
    {
        private readonly MemoryRealtimeService _realtimeService;
        private readonly Dictionary<(string, string), object> _documents;

        internal MemoryConnection(MemoryRealtimeService realtimeService)
        {
            _realtimeService = realtimeService;
            _documents = new Dictionary<(string, string), object>();
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
        public Task CommitTransactionAsync()
        {
            return Task.CompletedTask;
        }

        /// <summary>
        /// Creates a document asynchronously.
        /// </summary>
        /// <exception cref="NotImplementedException">
        /// This is not supported by a <see cref="MemoryConnection" />.
        /// </exception>
        public Task<Snapshot<T>> CreateDocAsync<T>(string collection, string id, T data, string otTypeName)
        {
            throw new NotImplementedException();
        }

        /// <summary>
        /// Deletes a document asynchronously.
        /// </summary>
        /// <exception cref="NotImplementedException">
        /// This is not supported by a <see cref="MemoryConnection" />.
        /// </exception>
        public Task DeleteDocAsync(string collection, string id)
        {
            throw new NotImplementedException();
        }

        public void Dispose() { }

        /// <summary>
        /// Excludes the field from the transaction.
        /// </summary>
        /// <typeparam name="T">The type.</typeparam>
        /// <param name="op">The field.</param>
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
        public Task<Snapshot<T>> FetchDocAsync<T>(string collection, string id)
        {
            throw new NotImplementedException();
        }

        public IDocument<T> Get<T>(string id) where T : IIdentifiable
        {
            DocConfig docConfig = _realtimeService.GetDocConfig<T>();
            if (_documents.TryGetValue((docConfig.CollectionName, id), out object docObj))
                return (IDocument<T>)docObj;

            MemoryRepository<T> repo = _realtimeService.GetRepository<T>();
            IDocument<T> doc = new MemoryDocument<T>(repo, docConfig.OTTypeName, docConfig.CollectionName, id);
            _documents[(docConfig.CollectionName, id)] = doc;
            return doc;
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
            int currentVersion
        )
        {
            throw new NotImplementedException();
        }
    }
}
