using System.Threading.Tasks;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

public interface IDraftNotifier
{
    Task NotifyDraftApplyProgress(string sfProjectId, DraftApplyState draftApplyState);
    Task SubscribeToProject(string projectId);
}
