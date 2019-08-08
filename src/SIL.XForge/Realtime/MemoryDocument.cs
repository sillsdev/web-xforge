using System;
using System.Threading.Tasks;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Utils;

namespace SIL.XForge.Realtime
{
    public class MemoryDocument<T> : IDocument<T> where T : IIdentifiable
    {
        private readonly MemoryRepository<T> _repo;

        internal MemoryDocument(MemoryRepository<T> repo, string otTypeName, string collection,
            string id)
        {
            _repo = repo;
            OTTypeName = otTypeName;
            Collection = collection;
            Id = id;
        }

        public string Collection { get; }

        public string Id { get; }

        public int Version { get; private set; }

        public string OTTypeName { get; }

        public T Data { get; private set; }

        public bool IsLoaded => Data != null;

        public async Task CreateAsync(T data)
        {
            data.Id = Id;
            await _repo.InsertAsync(data);
            Data = data;
            Version = 0;
        }

        public async Task DeleteAsync()
        {
            await _repo.DeleteAsync(Id);
            Data = default(T);
            Version = -1;
        }

        public async Task FetchAsync()
        {
            Attempt<T> attempt = await _repo.TryGetAsync(Id);
            if (attempt.TryResult(out T data))
            {
                Data = data;
                Version = 0;
            }
        }

        public async Task FetchOrCreateAsync(Func<T> createData)
        {
            await FetchAsync();
            if (!IsLoaded)
                await CreateAsync(createData());
        }

        public async Task SubmitOpAsync(object op)
        {
            Data = await MemoryRealtimeService.Server.ApplyOpAsync(OTTypeName, Data, op);
            Data.Id = Id;
            Version++;
            await _repo.ReplaceAsync(Data);
        }
    }
}
