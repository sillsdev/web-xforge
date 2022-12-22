using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services
{
    public class NotificationHub : Hub<INotifier>, INotifier
    {
        public async Task NotifySyncProgress(string projectId, ProgressState progressState) =>
            await Clients.All.NotifySyncProgress(projectId, progressState);
    }
}
