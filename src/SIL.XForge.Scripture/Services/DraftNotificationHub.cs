using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

[Authorize]
public class DraftNotificationHub : Hub<IDraftNotifier>, IDraftNotifier
{
    /// <summary>
    /// Notifies subscribers to a project of draft application progress.
    /// </summary>
    /// <param name="projectId">The Scripture Forge project identifier.</param>
    /// <param name="draftApplyState">The state of the draft being applied.</param>
    /// <returns>The asynchronous task.</returns>
    public async Task NotifyDraftApplyProgress(string projectId, DraftApplyState draftApplyState) =>
        await Clients.Group(projectId).NotifyDraftApplyProgress(projectId, draftApplyState);

    /// <summary>
    /// Subscribe to notifications for a project.
    ///
    /// This is called from the frontend via <c>project-notification.service.ts</c>.
    /// </summary>
    /// <param name="projectId">The Scripture Forge project identifier.</param>
    /// <returns>The asynchronous task.</returns>
    public async Task SubscribeToProject(string projectId) =>
        await Groups.AddToGroupAsync(Context.ConnectionId, projectId);
}
