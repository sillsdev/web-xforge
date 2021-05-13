using System.Threading.Tasks;

namespace SIL.XForge.Scripture.Services
{
    public interface ISyncService
    {
        Task SyncAsync(string curUserId, string projectId, bool trainEngine);
        Task CancelSyncAsync(string curUserId, string projectId);
    }
}
