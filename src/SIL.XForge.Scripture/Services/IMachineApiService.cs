using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using SIL.Machine.WebApi;

namespace SIL.XForge.Scripture.Services
{
    public interface IMachineApiService
    {
        Task<BuildDto?> GetBuildAsync(
            string curUserId,
            string projectId,
            long? minRevision,
            CancellationToken cancellationToken
        );
        Task<EngineDto> GetEngineAsync(string curUserId, string projectId, CancellationToken cancellationToken);
        Task<WordGraphDto> GetWordGraphAsync(
            string curUserId,
            string projectId,
            IReadOnlyCollection<string> segment,
            CancellationToken cancellationToken
        );
        Task<BuildDto> StartBuildAsync(string curUserId, string projectId, CancellationToken cancellationToken);
        Task TrainSegmentAsync(
            string curUserId,
            string projectId,
            SegmentPairDto segmentPair,
            CancellationToken cancellationToken
        );
    }
}
