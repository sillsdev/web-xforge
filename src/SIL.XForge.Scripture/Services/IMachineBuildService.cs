using System.Threading;
using System.Threading.Tasks;
using SIL.Machine.WebApi;

namespace SIL.XForge.Scripture.Services;

public interface IMachineBuildService
{
    Task CancelCurrentBuildAsync(string translationEngineId, CancellationToken cancellationToken);
    Task<BuildDto?> GetCurrentBuildAsync(
        string translationEngineId,
        long? minRevision,
        CancellationToken cancellationToken
    );
    Task<BuildDto> StartBuildAsync(string translationEngineId, CancellationToken cancellationToken);
}
