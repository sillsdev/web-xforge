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
            string sfProjectId,
            string buildId,
            long? minRevision,
            CancellationToken cancellationToken
        );
        Task<BuildDto?> GetCurrentBuildAsync(
            string curUserId,
            string sfProjectId,
            long? minRevision,
            CancellationToken cancellationToken
        );
        Task<EngineDto> GetEngineAsync(string curUserId, string sfProjectId, CancellationToken cancellationToken);
        Task<WordGraphDto> GetWordGraphAsync(
            string curUserId,
            string sfProjectId,
            IReadOnlyList<string> segment,
            CancellationToken cancellationToken
        );
        Task<BuildDto> StartBuildAsync(string curUserId, string sfProjectId, CancellationToken cancellationToken);
        Task TrainSegmentAsync(
            string curUserId,
            string sfProjectId,
            SegmentPairDto segmentPair,
            CancellationToken cancellationToken
        );
        Task<TranslationResultDto> TranslateAsync(
            string curUserId,
            string sfProjectId,
            IReadOnlyList<string> segment,
            CancellationToken cancellationToken
        );
        Task<TranslationResultDto[]> TranslateNAsync(
            string curUserId,
            string sfProjectId,
            int n,
            IReadOnlyList<string> segment,
            CancellationToken cancellationToken
        );
    }
}
