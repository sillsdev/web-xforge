using System.Threading;
using System.Threading.Tasks;

namespace SIL.XForge.Scripture.Services;

public interface IMachineProjectService
{
    Task AddProjectAsync(string curUserId, string sfProjectId, CancellationToken cancellationToken);
    Task BuildProjectAsync(string curUserId, string sfProjectId, CancellationToken cancellationToken);
    Task RemoveProjectAsync(string curUserId, string sfProjectId, CancellationToken cancellationToken);
    Task<bool> SyncProjectCorporaAsync(string curUserId, string sfProjectId, CancellationToken cancellationToken);
}
