using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

[Authorize]
public class NotificationHub : Hub<INotifier>, INotifier
{
    /// <summary>
    /// Notifies subscribers to a project of sync progress.
    /// </summary>
    /// <param name="projectId">The Scripture Forge project identifier.</param>
    /// <param name="progressState">
    /// The progress state, including a string value (Paratext only - not used in SF), or percentage value.
    /// </param>
    /// <returns>The asynchronous task.</returns>
    public async Task NotifySyncProgress(string projectId, ProgressState progressState) =>
        await Clients.Group(projectId).NotifySyncProgress(projectId, progressState);

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
