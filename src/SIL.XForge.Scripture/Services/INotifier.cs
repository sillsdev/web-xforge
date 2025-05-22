using System.Threading.Tasks;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

public interface INotifier
{
    Task NotifyBuildProgress(string sfProjectId, ServalBuildState buildState);
    Task NotifySyncProgress(string sfProjectId, ProgressState progressState);
    Task SubscribeToProject(string projectId);
}
