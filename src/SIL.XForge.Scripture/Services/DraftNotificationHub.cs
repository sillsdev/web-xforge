using System.Threading.Tasks;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

public class DraftNotificationHub(IRealtimeService realtimeService)
    : NotificationHubBase<IDraftNotifier>(realtimeService),
        IDraftNotifier
{
    /// <summary>
    /// Notifies subscribers to a project of draft application progress.
    /// </summary>
    /// <param name="projectId">The Scripture Forge project identifier.</param>
    /// <param name="draftApplyState">The state of the draft being applied.</param>
    /// <returns>The asynchronous task.</returns>
    /// <remarks>
    /// This differs from the implementation in <see cref="NotificationHub"/> in that this version
    /// does have stateful reconnection, and so there is a guarantee that it is received by clients.
    ///
    /// This is a blocking operation if the stateful reconnection buffer is full, so it should only
    /// be subscribed to by the user performing the draft import. Using <see cref="NotificationHub"/>
    /// is sufficient for all other users to subscribe to, although they will not receive all draft
    /// progress notifications, only the final success message.
    /// </remarks>
    public async Task NotifyDraftApplyProgress(string projectId, DraftApplyState draftApplyState)
    {
        await EnsurePermissionAsync(projectId);
        await Clients.Group(projectId).NotifyDraftApplyProgress(projectId, draftApplyState);
    }
}
