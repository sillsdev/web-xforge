using System.Threading.Tasks;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Utils;

namespace SIL.XForge.Realtime
{
    public static class RealtimeExtensions
    {
        public static async Task<Attempt<T>> TryGetSnapshotAsync<T>(this IRealtimeService realtimeService, string type,
            string id) where T : Json0Snapshot, new()
        {
            T entity = await realtimeService.QuerySnapshots<T>(type).FirstOrDefaultAsync(e => e.Id == id);
            return new Attempt<T>(entity != null, entity);
        }

        public static async Task<T> GetSnapshotAsync<T>(this IRealtimeService realtimeService, string type, string id)
            where T : Json0Snapshot, new()
        {
            Attempt<T> attempt = await realtimeService.TryGetSnapshotAsync<T>(type, id);
            if (attempt.Success)
                return attempt.Result;
            return default(T);
        }
    }
}
