using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

public static class NotificationHubExtensions
{
    public static Task NotifyDraftApplyProgress(
        this IHubContext<DraftNotificationHub, IDraftNotifier> hubContext,
        string projectId,
        DraftApplyState draftApplyState
    ) => hubContext.Clients.Groups(projectId).NotifyDraftApplyProgress(projectId, draftApplyState);

    public static Task NotifyBuildProgress(
        this IHubContext<NotificationHub, INotifier> hubContext,
        string projectId,
        ServalBuildState buildState
    ) => hubContext.Clients.Groups(projectId).NotifyBuildProgress(projectId, buildState);

    public static Task NotifyDraftApplyProgress(
        this IHubContext<NotificationHub, INotifier> hubContext,
        string projectId,
        DraftApplyState draftApplyState
    ) => hubContext.Clients.Groups(projectId).NotifyDraftApplyProgress(projectId, draftApplyState);

    public static Task NotifySyncProgress(
        this IHubContext<NotificationHub, INotifier> hubContext,
        string projectId,
        ProgressState progressState
    ) => hubContext.Clients.Groups(projectId).NotifySyncProgress(projectId, progressState);
}
