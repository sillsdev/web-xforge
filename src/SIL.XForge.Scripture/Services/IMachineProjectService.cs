using System.Threading;
using System.Threading.Tasks;

namespace SIL.XForge.Scripture.Services
{
    public interface IMachineProjectService
    {
        Task AddProjectAsync(string curUserId, string projectId, CancellationToken cancellationToken);
        Task BuildProjectAsync(
            string curUserId,
            string projectId,
            bool trainInMemoryEngine,
            CancellationToken cancellationToken
        );
        Task RemoveProjectAsync(string curUserId, string projectId, CancellationToken cancellationToken);
        Task<bool> SyncProjectCorporaAsync(string curUserId, string projectId, CancellationToken cancellationToken);
    }
}
