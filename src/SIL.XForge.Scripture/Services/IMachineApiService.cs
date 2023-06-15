using System.Threading;
using System.Threading.Tasks;
using Serval.Client;
using SIL.Machine.WebApi;

namespace SIL.XForge.Scripture.Services;

public interface IMachineApiService
{
    Task CancelPreTranslationBuildAsync(string curUserId, string sfProjectId, CancellationToken cancellationToken);
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
    Task<WordGraph> GetWordGraphAsync(
        string curUserId,
        string sfProjectId,
        string segment,
        CancellationToken cancellationToken
    );
    Task<BuildDto> StartBuildAsync(string curUserId, string sfProjectId, CancellationToken cancellationToken);
    Task<BuildDto?> StartPreTranslationBuildAsync(
        string curUserId,
        string sfProjectId,
        CancellationToken cancellationToken
    );
    Task TrainSegmentAsync(
        string curUserId,
        string sfProjectId,
        SegmentPair segmentPair,
        CancellationToken cancellationToken
    );
    Task<TranslationResult> TranslateAsync(
        string curUserId,
        string sfProjectId,
        string segment,
        CancellationToken cancellationToken
    );
    Task<TranslationResult[]> TranslateNAsync(
        string curUserId,
        string sfProjectId,
        int n,
        string segment,
        CancellationToken cancellationToken
    );
}
