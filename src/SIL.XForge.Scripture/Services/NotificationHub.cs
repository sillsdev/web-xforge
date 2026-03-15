using System.Threading.Tasks;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

public class NotificationHub(IRealtimeService realtimeService)
    : NotificationHubBase<INotifier>(realtimeService),
        INotifier
{
    /// <summary>
    /// Notifies subscribers to a project of draft build progress.
    /// </summary>
    /// <param name="projectId">The Scripture Forge project identifier.</param>
    /// <param name="buildState">The build state from Serval.</param>
    /// <returns>The asynchronous task.</returns>
    /// <remarks>
    /// This will currently be emitted on the TranslationBuildStarted and TranslationBuildFinished webhooks,
    /// and when the draft pre-translations have been retrieved.
    /// </remarks>
    public async Task NotifyBuildProgress(string projectId, ServalBuildState buildState)
    {
        await EnsurePermissionAsync(projectId);
        await Clients.Group(projectId).NotifyBuildProgress(projectId, buildState);
    }

    /// <summary>
    /// Notifies subscribers to a project of draft application progress.
    /// </summary>
    /// <param name="projectId">The Scripture Forge project identifier.</param>
    /// <param name="draftApplyState">The state of the draft being applied.</param>
    /// <returns>The asynchronous task.</returns>
    /// <remarks>
    /// This differs from the implementation in <see cref="DraftNotificationHub"/> in that this version
    /// does not have stateful reconnection, and so there is no guarantee that the message is received.
    /// </remarks>
    public async Task NotifyDraftApplyProgress(string projectId, DraftApplyState draftApplyState)
    {
        await EnsurePermissionAsync(projectId);
        await Clients.Group(projectId).NotifyDraftApplyProgress(projectId, draftApplyState);
    }

    /// <summary>
    /// Notifies subscribers to a project of sync progress.
    /// </summary>
    /// <param name="projectId">The Scripture Forge project identifier.</param>
    /// <param name="progressState">
    /// The progress state, including a string value (Paratext only - not used in SF), or percentage value.
    /// </param>
    /// <returns>The asynchronous task.</returns>
    public async Task NotifySyncProgress(string projectId, ProgressState progressState)
    {
        await EnsurePermissionAsync(projectId);
        await Clients.Group(projectId).NotifySyncProgress(projectId, progressState);
    }
}
