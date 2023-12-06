using System.Threading.Tasks;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

public interface ISyncService
{
    Task<string> SyncAsync(SyncConfig syncConfig);
    Task CancelSyncAsync(string curUserId, string projectId);
}
