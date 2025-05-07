using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Autofac.Extras.DynamicProxy;
using Serval.Client;
using SIL.Converters.Usj;
using SIL.XForge.EventMetrics;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

[Intercept(typeof(EventMetricLogger))]
public interface IMachineApiService
{
    [LogEventMetric(EventScope.Drafting, nameof(curUserId), nameof(sfProjectId), captureReturnValue: true)]
    Task<string?> CancelPreTranslationBuildAsync(
        string curUserId,
        string sfProjectId,
        CancellationToken cancellationToken
    );
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
    public IAsyncEnumerable<ServalBuildDto> GetBuildsAsync(
        string curUserId,
        string sfProjectId,
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
        bool isServalAdmin,
        DateTime timestamp,
        CancellationToken cancellationToken
    );
    IAsyncEnumerable<DocumentRevision> GetPreTranslationRevisionsAsync(
        string curUserId,
        string sfProjectId,
        int bookNum,
        int chapterNum,
        bool isServalAdmin,
        CancellationToken cancellationToken
    );
    Task<string> GetPreTranslationUsfmAsync(
        string curUserId,
        string sfProjectId,
        int bookNum,
        int chapterNum,
        bool isServalAdmin,
        DateTime timestamp,
        CancellationToken cancellationToken
    );
    Task<IUsj> GetPreTranslationUsjAsync(
        string curUserId,
        string sfProjectId,
        int bookNum,
        int chapterNum,
        bool isServalAdmin,
        DateTime timestamp,
        CancellationToken cancellationToken
    );
    Task<string> GetPreTranslationUsxAsync(
        string curUserId,
        string sfProjectId,
        int bookNum,
        int chapterNum,
        bool isServalAdmin,
        DateTime timestamp,
        CancellationToken cancellationToken
    );
    Task<WordGraph> GetWordGraphAsync(
        string curUserId,
        string sfProjectId,
        string segment,
        CancellationToken cancellationToken
    );
    Task<LanguageDto> IsLanguageSupportedAsync(string languageCode, CancellationToken cancellationToken);

    [Mutex]
    Task RetrievePreTranslationStatusAsync(string sfProjectId, CancellationToken cancellationToken);

    [LogEventMetric(EventScope.Drafting, nameof(curUserId), nameof(sfProjectId))]
    Task StartBuildAsync(string curUserId, string sfProjectId, CancellationToken cancellationToken);

    [LogEventMetric(EventScope.Drafting, nameof(curUserId), projectId: "buildConfig.ProjectId")]
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
