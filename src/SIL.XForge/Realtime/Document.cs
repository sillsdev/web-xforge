using System;
using System.Threading;
using System.Threading.Tasks;
using SIL.XForge.Models;

namespace SIL.XForge.Realtime
{
    /// <summary>
    /// This class represents a real-time document.
    /// </summary>
    public class Document<T> : IDocument<T> where T : IIdentifiable
    {
        private readonly IConnection _connection;
        private readonly SemaphoreSlim _lock = new SemaphoreSlim(1, 1);

        internal Document(IConnection connection, string otTypeName, string collection, string id)
        {
            _connection = connection;
            OTTypeName = otTypeName;
            Collection = collection;
            Id = id;
        }

        public string Collection { get; }

        public string Id { get; }

        public int Version { get; private set; } = -1;

        public string OTTypeName { get; }

        public T Data { get; private set; }

        public bool IsLoaded => Data != null;

        public async Task CreateAsync(T data)
        {
            await _lock.WaitAsync();
            try
            {
                Snapshot<T> snapshot = await _connection.CreateDocAsync(Collection, Id, data, OTTypeName);
                UpdateFromSnapshot(snapshot);
            }
            finally
            {
                _lock.Release();
            }
        }

        public async Task FetchAsync()
        {
            await _lock.WaitAsync();
            try
            {
                Snapshot<T> snapshot = await _connection.FetchDocAsync<T>(Collection, Id);
                UpdateFromSnapshot(snapshot);
            }
            finally
            {
                _lock.Release();
            }
        }

        public async Task FetchOrCreateAsync(Func<T> createData)
        {
            await _lock.WaitAsync();
            try
            {
                Snapshot<T> snapshot = await _connection.FetchDocAsync<T>(Collection, Id);
                if (snapshot.Data == null)
                    snapshot = await _connection.CreateDocAsync(Collection, Id, createData(), OTTypeName);
                UpdateFromSnapshot(snapshot);
            }
            finally
            {
                _lock.Release();
            }
        }

        public async Task SubmitOpAsync(object op)
        {
            await _lock.WaitAsync();
            try
            {
                Snapshot<T> snapshot = await _connection.SubmitOpAsync<T>(Collection, Id, op, Data, Version);
                UpdateFromSnapshot(snapshot);
            }
            finally
            {
                _lock.Release();
            }
        }

        public async Task DeleteAsync()
        {
            await _lock.WaitAsync();
            try
            {
                await _connection.DeleteDocAsync(Collection, Id);
                Version = -1;
                Data = default(T);
            }
            finally
            {
                _lock.Release();
            }
        }

        private void UpdateFromSnapshot(Snapshot<T> snapshot)
        {
            Version = snapshot.Version;
            Data = snapshot.Data;
            if (Data != null)
                Data.Id = Id;
        }
    }
}
