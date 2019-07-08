using System.Threading.Tasks;

namespace SIL.XForge.Scripture.Services
{
    public interface ISyncService
    {
        Task SyncAsync(string projectId, string userId, bool trainEngine);
    }
}
