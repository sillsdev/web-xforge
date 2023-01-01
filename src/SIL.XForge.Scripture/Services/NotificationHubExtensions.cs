using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services
{
    public static class NotificationHubExtensions
    {
        public static Task NotifySyncProgress(
            this IHubContext<NotificationHub, INotifier> hubContext,
            string projectId,
            ProgressState? progressState
        ) => hubContext.Clients.Groups(projectId).NotifySyncProgress(projectId, progressState);
    }
}
