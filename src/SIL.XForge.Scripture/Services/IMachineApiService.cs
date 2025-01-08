using System.Threading;
using System.Threading.Tasks;
using Serval.Client;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

public interface IMachineApiService
{
    Task CancelPreTranslationBuildAsync(string curUserId, string sfProjectId, CancellationToken cancellationToken);
    Task ExecuteWebhookAsync(string json, string signature);
    Task<ServalBuildDto?> GetBuildAsync(
        string curUserId,
        string sfProjectId,
        string buildId,
        long? minRevision,
        bool preTranslate,
        bool isServalAdmin,
        CancellationToken cancellationToken
    );
    Task<ServalBuildDto?> GetCurrentBuildAsync(
        string curUserId,
        string sfProjectId,
        long? minRevision,
        bool preTranslate,
        bool isServalAdmin,
        CancellationToken cancellationToken
    );
    Task<ServalEngineDto> GetEngineAsync(string curUserId, string sfProjectId, CancellationToken cancellationToken);
    Task<ServalBuildDto?> GetLastCompletedPreTranslationBuildAsync(
        string curUserId,
        string sfProjectId,
        bool isServalAdmin,
        CancellationToken cancellationToken
    );
    Task<PreTranslationDto> GetPreTranslationAsync(
        string curUserId,
        string sfProjectId,
        int bookNum,
        int chapterNum,
        CancellationToken cancellationToken
    );
    Task<ServalBuildDto?> GetQueuedStateAsync(
        string curUserId,
        string sfProjectId,
        bool preTranslate,
        bool isServalAdmin,
        CancellationToken cancellationToken
    );
    Task<Snapshot<TextData>> GetPreTranslationDeltaAsync(
        string curUserId,
        string sfProjectId,
        int bookNum,
        int chapterNum,
        CancellationToken cancellationToken
    );
    Task<string> GetPreTranslationUsfmAsync(
        string curUserId,
        string sfProjectId,
        int bookNum,
        int chapterNum,
        bool isServalAdmin,
        CancellationToken cancellationToken
    );
    Task<string> GetPreTranslationUsxAsync(
        string curUserId,
        string sfProjectId,
        int bookNum,
        int chapterNum,
        CancellationToken cancellationToken
    );
    Task<WordGraph> GetWordGraphAsync(
        string curUserId,
        string sfProjectId,
        string segment,
        CancellationToken cancellationToken
    );
    Task<LanguageDto> IsLanguageSupportedAsync(string languageCode, CancellationToken cancellationToken);
    Task RetrievePreTranslationStatusAsync(string sfProjectId, CancellationToken cancellationToken);
    Task StartBuildAsync(string curUserId, string sfProjectId, CancellationToken cancellationToken);
    Task StartPreTranslationBuildAsync(string curUserId, BuildConfig buildConfig, CancellationToken cancellationToken);
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
