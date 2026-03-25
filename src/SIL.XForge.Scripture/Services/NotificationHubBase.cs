using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Base class for SignalR notification hubs, providing shared project subscription and
/// permission checking to ensure only authorized users with Paratext roles receive notifications.
/// </summary>
[Authorize]
public abstract class NotificationHubBase<T>(IRealtimeService realtimeService) : Hub<T>
    where T : class
{
    /// <summary>
    /// Subscribe to notifications for a project.
    ///
    /// This is called from the frontend via <c>project-notification.service.ts</c>.
    /// </summary>
    /// <param name="projectId">The Scripture Forge project identifier.</param>
    /// <returns>The asynchronous task.</returns>
    public async Task SubscribeToProject(string projectId)
    {
        await EnsurePermissionAsync(projectId);
        await Groups.AddToGroupAsync(Context.ConnectionId, projectId);
    }

    /// <summary>
    /// Ensures that the user has permission to access the project for SignalR notifications.
    /// </summary>
    /// <param name="projectId">The Scripture Forge project identifier.</param>
    /// <exception cref="DataNotFoundException">The project does not exist.</exception>
    /// <exception cref="ForbiddenException">
    /// The user does not have permission to access the project.
    /// </exception>
    protected async Task EnsurePermissionAsync(string projectId)
    {
        // Load the project from the realtime service
        Attempt<SFProject> attempt = await realtimeService.TryGetSnapshotAsync<SFProject>(projectId);
        if (!attempt.TryResult(out SFProject project))
        {
            throw new DataNotFoundException("The project does not exist.");
        }

        // Retrieve the user identifier
        string? userId = Context.GetHttpContext()?.User.FindFirst(XFClaimTypes.UserId)?.Value;
        if (string.IsNullOrWhiteSpace(userId))
        {
            throw new UnauthorizedAccessException();
        }

        // Ensure the user is on the project, and has a Paratext role
        if (!project.UserRoles.TryGetValue(userId, out string? role) || !SFProjectRole.IsParatextRole(role))
        {
            throw new ForbiddenException();
        }
    }
}
