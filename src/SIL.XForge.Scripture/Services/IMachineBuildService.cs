using System.Threading.Tasks;
using System.Threading;
using SIL.Machine.WebApi;

namespace SIL.XForge.Scripture.Services
{
    public interface IMachineBuildService
    {
        Task CancelCurrentBuildAsync(string translationEngineId, CancellationToken cancellationToken);
        Task<BuildDto?> GetBuildAsync(
            string translationEngineId,
            string buildId,
            long? minRevision,
            CancellationToken cancellationToken
        );
        Task<BuildDto?> GetCurrentBuildAsync(
            string translationEngineId,
            long? minRevision,
            CancellationToken cancellationToken
        );
        Task<BuildDto> StartBuildAsync(string translationEngineId, CancellationToken cancellationToken);
    }
}
