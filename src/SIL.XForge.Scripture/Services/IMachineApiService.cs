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
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

[Intercept(typeof(EventMetricLogger))]
public interface IMachineApiService
{
    [LogEventMetric(EventScope.Drafting, userId: "userAccessor.UserId", nameof(sfProjectId))]
    Task CancelPreTranslationBuildAsync(
        IUserAccessor userAccessor,
        string sfProjectId,
        CancellationToken cancellationToken
    );
    Task ExecuteWebhookAsync(string json, string signature);
    Task<ServalBuildDto?> GetBuildAsync(
        IUserAccessor userAccessor,
        string sfProjectId,
        string buildId,
        long? minRevision,
        bool preTranslate,
        CancellationToken cancellationToken
    );
    Task<ServalBuildDto?> GetCurrentBuildAsync(
        IUserAccessor userAccessor,
        string sfProjectId,
        long? minRevision,
        bool preTranslate,
        CancellationToken cancellationToken
    );
    Task<ServalEngineDto> GetEngineAsync(
        IUserAccessor userAccessor,
        string sfProjectId,
        CancellationToken cancellationToken
    );
    Task<ServalBuildDto?> GetLastCompletedPreTranslationBuildAsync(
        IUserAccessor userAccessor,
        string sfProjectId,
        CancellationToken cancellationToken
    );
    Task<PreTranslationDto> GetPreTranslationAsync(
        IUserAccessor userAccessor,
        string sfProjectId,
        int bookNum,
        int chapterNum,
        CancellationToken cancellationToken
    );
    Task<ServalBuildDto?> GetQueuedStateAsync(IUserAccessor userAccessor, string sfProjectId, bool preTranslate);
    Task<Snapshot<TextData>> GetPreTranslationDeltaAsync(
        IUserAccessor userAccessor,
        string sfProjectId,
        int bookNum,
        int chapterNum,
        DateTime timestamp,
        CancellationToken cancellationToken
    );
    IAsyncEnumerable<DocumentRevision> GetPreTranslationRevisionsAsync(
        IUserAccessor userAccessor,
        string sfProjectId,
        int bookNum,
        int chapterNum,
        CancellationToken cancellationToken
    );
    Task<string> GetPreTranslationUsfmAsync(
        IUserAccessor userAccessor,
        string sfProjectId,
        int bookNum,
        int chapterNum,
        DateTime timestamp,
        CancellationToken cancellationToken
    );
    Task<IUsj> GetPreTranslationUsjAsync(
        IUserAccessor userAccessor,
        string sfProjectId,
        int bookNum,
        int chapterNum,
        DateTime timestamp,
        CancellationToken cancellationToken
    );
    Task<string> GetPreTranslationUsxAsync(
        IUserAccessor userAccessor,
        string sfProjectId,
        int bookNum,
        int chapterNum,
        DateTime timestamp,
        CancellationToken cancellationToken
    );
    Task<WordGraph> GetWordGraphAsync(
        IUserAccessor userAccessor,
        string sfProjectId,
        string segment,
        CancellationToken cancellationToken
    );
    Task<LanguageDto> IsLanguageSupportedAsync(string languageCode, CancellationToken cancellationToken);
    Task RetrievePreTranslationStatusAsync(string sfProjectId, CancellationToken cancellationToken);

    [LogEventMetric(EventScope.Drafting, userId: "userAccessor.UserId", nameof(sfProjectId))]
    Task StartBuildAsync(IUserAccessor userAccessor, string sfProjectId, CancellationToken cancellationToken);

    [LogEventMetric(EventScope.Drafting, userId: "userAccessor.UserId", projectId: "buildConfig.ProjectId")]
    Task StartPreTranslationBuildAsync(
        IUserAccessor userAccessor,
        BuildConfig buildConfig,
        CancellationToken cancellationToken
    );
    Task TrainSegmentAsync(
        IUserAccessor userAccessor,
        string sfProjectId,
        SegmentPair segmentPair,
        CancellationToken cancellationToken
    );
    Task<TranslationResult> TranslateAsync(
        IUserAccessor userAccessor,
        string sfProjectId,
        string segment,
        CancellationToken cancellationToken
    );
    Task<TranslationResult[]> TranslateNAsync(
        IUserAccessor userAccessor,
        string sfProjectId,
        int n,
        string segment,
        CancellationToken cancellationToken
    );
}
