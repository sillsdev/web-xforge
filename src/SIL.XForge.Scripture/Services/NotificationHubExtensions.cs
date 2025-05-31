using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

public static class NotificationHubExtensions
{
    public static Task NotifyBuildProgress(
        this IHubContext<NotificationHub, INotifier> hubContext,
        string projectId,
        ServalBuildState buildState
    ) => hubContext.Clients.Groups(projectId).NotifyBuildProgress(projectId, buildState);

    public static Task NotifySyncProgress(
        this IHubContext<NotificationHub, INotifier> hubContext,
        string projectId,
        ProgressState progressState
    ) => hubContext.Clients.Groups(projectId).NotifySyncProgress(projectId, progressState);
}
