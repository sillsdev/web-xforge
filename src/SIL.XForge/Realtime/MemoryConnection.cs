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
        /// </remarks>
        public IRealtimeServer BeginTransaction()
        {
            return null;
        }

        /// <summary>
        /// Commits the transaction.
        /// </summary>
        /// <remarks>
        /// The <see cref="MemoryConnection" /> does not support transactions.
        /// </remarks>
        public Task CommitTransactionAsync()
        {
            return Task.CompletedTask;
        }

        public void Dispose()
        {
        }

        /// <summary>
        /// Excludes the field from the transaction.
        /// </summary>
        /// <typeparam name="T">The type.</typeparam>
        /// <param name="op">The field.</param>
        /// <remarks>
        /// The <see cref="MemoryConnection" /> does not support transactions.
        /// </remarks>
        public void ExcludePropertyFromTransaction<T>(Expression<Func<T, object>> field)
        {
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
        public Task RollbackTransactionAsync()
        {
            return Task.CompletedTask;
        }
    }
}
