using System.Threading;
using System.Threading.Tasks;
using Serval.Client;

namespace SIL.XForge.Scripture.Services;

public interface IMachineApiService
{
    Task<TranslationBuild?> GetBuildAsync(
        string curUserId,
        string sfProjectId,
        string buildId,
        long? minRevision,
        CancellationToken cancellationToken
    );
    Task<TranslationBuild?> GetCurrentBuildAsync(
        string curUserId,
        string sfProjectId,
        long? minRevision,
        CancellationToken cancellationToken
    );
    Task<TranslationEngine> GetEngineAsync(string curUserId, string sfProjectId, CancellationToken cancellationToken);
    Task<WordGraph> GetWordGraphAsync(
        string curUserId,
        string sfProjectId,
        string[] segment,
        CancellationToken cancellationToken
    );
    Task<TranslationBuild> StartBuildAsync(string curUserId, string sfProjectId, CancellationToken cancellationToken);
    Task TrainSegmentAsync(
        string curUserId,
        string sfProjectId,
        SegmentPair segmentPair,
        CancellationToken cancellationToken
    );
    Task<TranslationResult> TranslateAsync(
        string curUserId,
        string sfProjectId,
        string[] segment,
        CancellationToken cancellationToken
    );
    Task<TranslationResult[]> TranslateNAsync(
        string curUserId,
        string sfProjectId,
        int n,
        string[] segment,
        CancellationToken cancellationToken
    );
}
