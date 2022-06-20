using System;
using System.Threading.Tasks;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Utils;

namespace SIL.XForge.Realtime
{
    public static class RealtimeExtensions
    {
        public static async Task<Attempt<T>> TryGetSnapshotAsync<T>(this IRealtimeService realtimeService, string id)
            where T : IIdentifiable
        {
            T entity = await realtimeService.QuerySnapshots<T>().FirstOrDefaultAsync(e => e.Id == id);
            return new Attempt<T>(entity != null, entity);
        }

        public static async Task<T> GetSnapshotAsync<T>(this IRealtimeService realtimeService, string id)
            where T : IIdentifiable
        {
            Attempt<T> attempt = await realtimeService.TryGetSnapshotAsync<T>(id);
            if (attempt.Success)
                return attempt.Result;
            return default(T);
        }

        public static async Task<IDocument<T>> FetchAsync<T>(this IConnection conn, string id) where T : IIdentifiable
        {
            IDocument<T> doc = conn.Get<T>(id);
            await doc.FetchAsync();
            return doc;
        }

        public static async Task<IDocument<T>> CreateAsync<T>(this IConnection conn, string id, T data)
            where T : IIdentifiable
        {
            IDocument<T> doc = conn.Get<T>(id);
            await doc.CreateAsync(data);
            return doc;
        }

        public static async Task<IDocument<T>> FetchOrCreateAsync<T>(
            this IConnection conn,
            string id,
            Func<T> createData
        ) where T : IIdentifiable
        {
            IDocument<T> doc = conn.Get<T>(id);
            await doc.FetchOrCreateAsync(createData);
            return doc;
        }
    }
}
