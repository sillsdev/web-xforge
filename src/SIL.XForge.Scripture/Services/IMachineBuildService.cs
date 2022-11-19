using System.Threading.Tasks;
using System.Threading;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services
{
    public interface IMachineBuildService
    {
        Task CancelCurrentBuildAsync(string translationEngineId, CancellationToken cancellationToken);
        Task<MachineBuildJob?> GetCurrentBuildAsync(
            string translationEngineId,
            long? minRevision,
            CancellationToken cancellationToken
        );
        Task<MachineBuildJob> StartBuildAsync(string translationEngineId, CancellationToken cancellationToken);
    }
}
