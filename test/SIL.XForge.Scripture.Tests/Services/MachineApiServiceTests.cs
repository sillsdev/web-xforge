using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Hangfire;
using Hangfire.Common;
using Hangfire.States;
using Microsoft.Extensions.Options;
using Microsoft.FeatureManagement;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using NUnit.Framework;
using Polly.CircuitBreaker;
using Serval.Client;
using SIL.Machine.Annotations;
using SIL.Machine.Translation;
using SIL.Machine.WebApi;
using SIL.Machine.WebApi.Configuration;
using SIL.Machine.WebApi.DataAccess;
using SIL.Machine.WebApi.Models;
using SIL.Machine.WebApi.Services;
using SIL.XForge.DataAccess;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Realtime;
using SIL.XForge.Services;
using MachinePhrase = SIL.Machine.Translation.Phrase;
using MachineTranslationResult = SIL.Machine.Translation.TranslationResult;
using MachineWordGraph = SIL.Machine.Translation.WordGraph;
using MachineWordGraphArc = SIL.Machine.Translation.WordGraphArc;
// Until the In-Process Machine distinguishes its objects from Serval
using Phrase = Serval.Client.Phrase;
using TranslationResult = Serval.Client.TranslationResult;
using WordGraph = Serval.Client.WordGraph;
using WordGraphArc = Serval.Client.WordGraphArc;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class MachineApiServiceTests
{
    private const string Project01 = "project01";
    private const string Project02 = "project02";
    private const string Project03 = "project03";
    private const string Build01 = "build01";
    private const string TranslationEngine01 = "translationEngine01";
    private const string User01 = "user01";
    private const string Segment = "segment";
    private const string TargetSegment = "targetSegment";
    private const string JobId = "jobId";

    [Test]
    public void CancelPreTranslationBuildAsync_NoFeatureFlagEnabled()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.CancelPreTranslationBuildAsync(User01, Project01, CancellationToken.None)
        );
    }

    [Test]
    public void CancelPreTranslationBuildAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(
            () => env.Service.CancelPreTranslationBuildAsync("invalid_user_id", Project01, CancellationToken.None)
        );
    }

    [Test]
    public void CancelPreTranslationBuildAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.CancelPreTranslationBuildAsync(User01, "invalid_project_id", CancellationToken.None)
        );
    }

    [Test]
    public void CancelPreTranslationBuildAsync_NoTranslationEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.CancelPreTranslationBuildAsync(User01, "invalid_project_id", CancellationToken.None)
        );
    }

    [Test]
    public void CancelPreTranslationBuildAsync_NotSupported()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient
            .CancelBuildAsync(TranslationEngine01, CancellationToken.None)
            .Throws(ServalApiExceptions.NotSupported);

        // SUT
        Assert.ThrowsAsync<NotSupportedException>(
            () => env.Service.CancelPreTranslationBuildAsync(User01, Project01, CancellationToken.None)
        );
    }

    [Test]
    public void CancelPreTranslationBuildAsync_ServalNoTranslationEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.CancelPreTranslationBuildAsync(User01, Project03, CancellationToken.None)
        );
    }

    [Test]
    public async Task CancelPreTranslationBuildAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.QueuePreTranslationBuildAsync();

        // SUT
        await env.Service.CancelPreTranslationBuildAsync(User01, Project01, CancellationToken.None);

        await env.TranslationEnginesClient.Received(1).CancelBuildAsync(TranslationEngine01, CancellationToken.None);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.PreTranslationJobId);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.PreTranslationQueuedAt);
    }

    [Test]
    public async Task GetBuildAsync_InProcessNoRevisionNoBuildRunning()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));
        env.Builds
            .GetByLocatorAsync(BuildLocatorType.Id, Build01, CancellationToken.None)
            .Returns(Task.FromResult<Build>(null));

        // SUT
        ServalBuildDto? actual = await env.Service.GetBuildAsync(
            User01,
            Project01,
            Build01,
            minRevision: null,
            preTranslate: false,
            includeAdditionalInfo: false,
            CancellationToken.None
        );

        Assert.IsNull(actual);
    }

    [Test]
    public void GetBuildAsync_InProcessSpecificRevisionBuildEnded()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));

        // NOTE: It is not possible to test No Build Running, as the Subscription Change cannot be modified
        env.Builds
            .SubscribeAsync(Build01, CancellationToken.None)
            .Returns(Task.FromResult(new Subscription<Build>(Build01, null, _ => { })));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.GetBuildAsync(
                    User01,
                    Project01,
                    Build01,
                    minRevision: 1,
                    preTranslate: false,
                    includeAdditionalInfo: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public void GetBuildAsync_ServalBuildEnded()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const int minRevision = 0;
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));
        env.TranslationEnginesClient
            .GetBuildAsync(TranslationEngine01, Build01, minRevision, CancellationToken.None)
            .Throws(ServalApiExceptions.NotFound);

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.GetBuildAsync(
                    User01,
                    Project01,
                    Build01,
                    minRevision,
                    preTranslate: false,
                    includeAdditionalInfo: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public async Task GetBuildAsync_ServalNoBuildRunning()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));
        env.TranslationEnginesClient
            .GetBuildAsync(TranslationEngine01, Build01, null, CancellationToken.None)
            .Throws(ServalApiExceptions.TimeOut);

        // SUT
        ServalBuildDto? actual = await env.Service.GetBuildAsync(
            User01,
            Project01,
            Build01,
            minRevision: null,
            preTranslate: false,
            includeAdditionalInfo: false,
            CancellationToken.None
        );

        Assert.IsNull(actual);
    }

    [Test]
    public void GetBuildAsync_NoFeatureFlagsEnabled()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.GetBuildAsync(
                    User01,
                    Project01,
                    Build01,
                    minRevision: null,
                    preTranslate: false,
                    includeAdditionalInfo: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public void GetBuildAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(
            () =>
                env.Service.GetBuildAsync(
                    "invalid_user_id",
                    Project01,
                    Build01,
                    minRevision: null,
                    preTranslate: false,
                    includeAdditionalInfo: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public void GetBuildAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.GetBuildAsync(
                    User01,
                    "invalid_project_id",
                    Build01,
                    minRevision: null,
                    preTranslate: false,
                    includeAdditionalInfo: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public void GetBuildAsync_ServalNoTranslationEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.GetBuildAsync(
                    User01,
                    Project03,
                    Build01,
                    minRevision: null,
                    preTranslate: false,
                    includeAdditionalInfo: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public async Task GetBuildAsync_InProcessSuccess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string buildDtoId = $"{Project01}.{Build01}";
        const string message = "Finalizing";
        const double percentCompleted = 0.95;
        const int revision = 553;
        const string state = "ACTIVE";
        env.Builds
            .GetByLocatorAsync(BuildLocatorType.Id, Build01, CancellationToken.None)
            .Returns(
                Task.FromResult(
                    new Build
                    {
                        Id = Build01,
                        Message = message,
                        PercentCompleted = percentCompleted,
                        Revision = revision,
                        State = state,
                    }
                )
            );
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));

        // SUT
        ServalBuildDto? actual = await env.Service.GetBuildAsync(
            User01,
            Project01,
            Build01,
            minRevision: null,
            preTranslate: false,
            includeAdditionalInfo: false,
            CancellationToken.None
        );

        Assert.IsNotNull(actual);
        Assert.AreEqual(message, actual.Message);
        Assert.AreEqual(percentCompleted, actual.PercentCompleted);
        Assert.AreEqual(revision, actual.Revision);
        Assert.AreEqual(state, actual.State);
        Assert.AreEqual(buildDtoId, actual.Id);
        Assert.AreEqual(MachineApi.GetBuildHref(Project01, Build01), actual.Href);
        Assert.AreEqual(Project01, actual.Engine.Id);
        Assert.AreEqual(MachineApi.GetEngineHref(Project01), actual.Engine.Href);
    }

    [Test]
    public async Task GetBuildAsync_ServalSuccess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string buildDtoId = $"{Project01}.{Build01}";
        const string message = "Finalizing";
        const double percentCompleted = 0.95;
        const int revision = 553;
        const JobState state = JobState.Active;
        env.TranslationEnginesClient
            .GetBuildAsync(TranslationEngine01, Build01, minRevision: null, CancellationToken.None)
            .Returns(
                Task.FromResult(
                    new TranslationBuild
                    {
                        Url = "https://example.com",
                        Id = Build01,
                        Engine = new ResourceLink { Id = "engineId", Url = "https://example.com" },
                        Message = message,
                        PercentCompleted = percentCompleted,
                        Revision = revision,
                        State = state,
                    }
                )
            );
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        ServalBuildDto? actual = await env.Service.GetBuildAsync(
            User01,
            Project01,
            Build01,
            minRevision: null,
            preTranslate: false,
            includeAdditionalInfo: false,
            CancellationToken.None
        );

        Assert.IsNotNull(actual);
        Assert.AreEqual(message, actual.Message);
        Assert.AreEqual(percentCompleted, actual.PercentCompleted);
        Assert.AreEqual(revision, actual.Revision);
        Assert.AreEqual(state.ToString().ToUpperInvariant(), actual.State);
        Assert.AreEqual(buildDtoId, actual.Id);
        Assert.AreEqual(MachineApi.GetBuildHref(Project01, Build01), actual.Href);
        Assert.AreEqual(Project01, actual.Engine.Id);
        Assert.AreEqual(MachineApi.GetEngineHref(Project01), actual.Engine.Href);
        Assert.IsNull(actual.AdditionalInfo);
    }

    [Test]
    public async Task GetBuildAsync_ServalIncludesAdditionalInfo()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string buildDtoId = $"{Project01}.{Build01}";
        const string message = "Finalizing";
        const double percentCompleted = 0.95;
        const int revision = 553;
        const JobState state = JobState.Active;
        const int queueDepth = 7;
        DateTimeOffset dateFinished = DateTimeOffset.UtcNow;
        const string engineId = "engineId1";
        const string corpusId1 = "corpusId1";
        const string corpusId2 = "corpusId2";
        const int step = 123;
        env.TranslationEnginesClient
            .GetBuildAsync(TranslationEngine01, Build01, minRevision: null, CancellationToken.None)
            .Returns(
                Task.FromResult(
                    new TranslationBuild
                    {
                        Url = "https://example.com",
                        Id = Build01,
                        Engine = new ResourceLink { Id = engineId, Url = "https://example.com" },
                        Message = message,
                        PercentCompleted = percentCompleted,
                        Revision = revision,
                        State = state,
                        DateFinished = dateFinished,
                        QueueDepth = queueDepth,
                        Step = step,
                        Pretranslate = new List<PretranslateCorpus>
                        {
                            new PretranslateCorpus
                            {
                                Corpus = new ResourceLink { Id = corpusId1, Url = "https://example.com" },
                            },
                            new PretranslateCorpus
                            {
                                Corpus = new ResourceLink { Id = corpusId2, Url = "https://example.com" },
                            },
                        },
                    }
                )
            );
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        ServalBuildDto? actual = await env.Service.GetBuildAsync(
            User01,
            Project01,
            Build01,
            minRevision: null,
            preTranslate: false,
            includeAdditionalInfo: true,
            CancellationToken.None
        );

        Assert.IsNotNull(actual);
        Assert.AreEqual(message, actual.Message);
        Assert.AreEqual(percentCompleted, actual.PercentCompleted);
        Assert.AreEqual(revision, actual.Revision);
        Assert.AreEqual(state.ToString().ToUpperInvariant(), actual.State);
        Assert.AreEqual(buildDtoId, actual.Id);
        Assert.AreEqual(MachineApi.GetBuildHref(Project01, Build01), actual.Href);
        Assert.AreEqual(Project01, actual.Engine.Id);
        Assert.AreEqual(MachineApi.GetEngineHref(Project01), actual.Engine.Href);
        Assert.AreEqual(queueDepth, actual.QueueDepth);
        Assert.IsNotNull(actual.AdditionalInfo);
        Assert.AreEqual(Build01, actual.AdditionalInfo.BuildId);
        Assert.AreEqual(dateFinished, actual.AdditionalInfo.DateFinished);
        Assert.AreEqual(step, actual.AdditionalInfo.Step);
        Assert.AreEqual(engineId, actual.AdditionalInfo.TranslationEngineId);
        Assert.IsNotNull(actual.AdditionalInfo.CorporaIds);
        Assert.AreEqual(2, actual.AdditionalInfo.CorporaIds.Count());
        Assert.AreEqual(corpusId1, actual.AdditionalInfo.CorporaIds.First());
        Assert.AreEqual(corpusId2, actual.AdditionalInfo.CorporaIds.Last());
    }

    [Test]
    public async Task GetBuildAsync_DoesNotExecuteInProcessIfBothEnabledForPreTranslations()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient
            .GetBuildAsync(TranslationEngine01, Build01, minRevision: null, CancellationToken.None)
            .Returns(Task.FromResult(new TranslationBuild()));

        // SUT
        _ = await env.Service.GetBuildAsync(
            User01,
            Project01,
            Build01,
            minRevision: null,
            preTranslate: true,
            includeAdditionalInfo: false,
            CancellationToken.None
        );

        await env.Builds
            .DidNotReceiveWithAnyArgs()
            .GetByLocatorAsync(BuildLocatorType.Id, Build01, CancellationToken.None);
        await env.TranslationEnginesClient
            .Received(1)
            .GetBuildAsync(TranslationEngine01, Build01, minRevision: null, CancellationToken.None);
    }

    [Test]
    public async Task GetBuildAsync_ExecutesOnlyInProcessIfBothEnabled()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        _ = await env.Service.GetBuildAsync(
            User01,
            Project01,
            Build01,
            minRevision: null,
            preTranslate: false,
            includeAdditionalInfo: false,
            CancellationToken.None
        );

        await env.Builds.Received(1).GetByLocatorAsync(BuildLocatorType.Id, Build01, CancellationToken.None);
        await env.TranslationEnginesClient
            .DidNotReceiveWithAnyArgs()
            .GetBuildAsync(TranslationEngine01, Build01, minRevision: null, CancellationToken.None);
    }

    [Test]
    public async Task GetCurrentBuildAsync_InProcessNoRevisionNoBuildRunning()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));
        env.Builds
            .GetByLocatorAsync(BuildLocatorType.Engine, TranslationEngine01, CancellationToken.None)
            .Returns(Task.FromResult<Build>(null));

        // SUT
        ServalBuildDto? actual = await env.Service.GetCurrentBuildAsync(
            User01,
            Project01,
            minRevision: null,
            preTranslate: false,
            includeAdditionalInfo: false,
            CancellationToken.None
        );

        Assert.IsNull(actual);
    }

    [Test]
    public void GetCurrentBuildAsync_InProcessSpecificRevisionBuildEnded()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));

        // NOTE: It is not possible to test No Build Running, as the Subscription Change cannot be modified
        env.Builds
            .SubscribeByEngineIdAsync(TranslationEngine01, CancellationToken.None)
            .Returns(Task.FromResult(new Subscription<Build>(TranslationEngine01, null, _ => { })));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.GetCurrentBuildAsync(
                    User01,
                    Project01,
                    minRevision: 1,
                    preTranslate: false,
                    includeAdditionalInfo: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public void GetCurrentBuildAsync_ServalBuildEnded()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const int minRevision = 0;
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));
        env.TranslationEnginesClient
            .GetCurrentBuildAsync(TranslationEngine01, minRevision, CancellationToken.None)
            .Throws(ServalApiExceptions.NoContent);

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.GetCurrentBuildAsync(
                    User01,
                    Project01,
                    minRevision,
                    preTranslate: false,
                    includeAdditionalInfo: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public async Task GetCurrentBuildAsync_ServalNoBuildRunning()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));
        env.TranslationEnginesClient
            .GetCurrentBuildAsync(TranslationEngine01, null, CancellationToken.None)
            .Throws(ServalApiExceptions.TimeOut);

        // SUT
        ServalBuildDto? actual = await env.Service.GetCurrentBuildAsync(
            User01,
            Project01,
            minRevision: null,
            preTranslate: false,
            includeAdditionalInfo: false,
            CancellationToken.None
        );

        Assert.IsNull(actual);
    }

    [Test]
    public void GetCurrentBuildAsync_NoFeatureFlagsEnabled()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.GetCurrentBuildAsync(
                    User01,
                    Project01,
                    minRevision: null,
                    preTranslate: false,
                    includeAdditionalInfo: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public void GetCurrentBuildAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(
            () =>
                env.Service.GetCurrentBuildAsync(
                    "invalid_user_id",
                    Project01,
                    minRevision: null,
                    preTranslate: false,
                    includeAdditionalInfo: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public void GetCurrentBuildAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.GetCurrentBuildAsync(
                    User01,
                    "invalid_project_id",
                    minRevision: null,
                    preTranslate: false,
                    includeAdditionalInfo: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public void GetCurrentBuildAsync_InProcessNoEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));
        env.Engines
            .GetByLocatorAsync(EngineLocatorType.Project, Project01, CancellationToken.None)
            .Returns(Task.FromResult<Engine>(null));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.GetCurrentBuildAsync(
                    User01,
                    Project01,
                    minRevision: null,
                    preTranslate: false,
                    includeAdditionalInfo: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public void GetCurrentBuildAsync_ServalNoTranslationEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.GetCurrentBuildAsync(
                    User01,
                    Project03,
                    minRevision: null,
                    preTranslate: false,
                    includeAdditionalInfo: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public async Task GetCurrentBuildAsync_InProcessSuccess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string buildDtoId = $"{Project01}.{Build01}";
        const string message = "Finalizing";
        const double percentCompleted = 0.95;
        const int revision = 553;
        const string state = "ACTIVE";
        env.Builds
            .GetByLocatorAsync(BuildLocatorType.Engine, TranslationEngine01, CancellationToken.None)
            .Returns(
                Task.FromResult(
                    new Build
                    {
                        Id = Build01,
                        Message = message,
                        PercentCompleted = percentCompleted,
                        Revision = revision,
                        State = state,
                    }
                )
            );
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));

        // SUT
        ServalBuildDto? actual = await env.Service.GetCurrentBuildAsync(
            User01,
            Project01,
            minRevision: null,
            preTranslate: false,
            includeAdditionalInfo: false,
            CancellationToken.None
        );

        Assert.IsNotNull(actual);
        Assert.AreEqual(message, actual.Message);
        Assert.AreEqual(percentCompleted, actual.PercentCompleted);
        Assert.AreEqual(revision, actual.Revision);
        Assert.AreEqual(state, actual.State);
        Assert.AreEqual(buildDtoId, actual.Id);
        Assert.AreEqual(MachineApi.GetBuildHref(Project01, Build01), actual.Href);
        Assert.AreEqual(Project01, actual.Engine.Id);
        Assert.AreEqual(MachineApi.GetEngineHref(Project01), actual.Engine.Href);
    }

    [Test]
    public async Task GetCurrentBuildAsync_ServalSuccess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string buildDtoId = $"{Project01}.{Build01}";
        const string message = "Finalizing";
        const double percentCompleted = 0.95;
        const int revision = 553;
        const JobState state = JobState.Active;
        env.TranslationEnginesClient
            .GetCurrentBuildAsync(TranslationEngine01, minRevision: null, CancellationToken.None)
            .Returns(
                Task.FromResult(
                    new TranslationBuild
                    {
                        Url = "https://example.com",
                        Id = Build01,
                        Engine = new ResourceLink { Id = "engineId", Url = "https://example.com" },
                        Message = message,
                        PercentCompleted = percentCompleted,
                        Revision = revision,
                        State = state,
                    }
                )
            );
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        ServalBuildDto? actual = await env.Service.GetCurrentBuildAsync(
            User01,
            Project01,
            minRevision: null,
            preTranslate: false,
            includeAdditionalInfo: false,
            CancellationToken.None
        );

        Assert.IsNotNull(actual);
        Assert.AreEqual(message, actual.Message);
        Assert.AreEqual(percentCompleted, actual.PercentCompleted);
        Assert.AreEqual(revision, actual.Revision);
        Assert.AreEqual(state.ToString().ToUpperInvariant(), actual.State);
        Assert.AreEqual(buildDtoId, actual.Id);
        Assert.AreEqual(MachineApi.GetBuildHref(Project01, Build01), actual.Href);
        Assert.AreEqual(Project01, actual.Engine.Id);
        Assert.AreEqual(MachineApi.GetEngineHref(Project01), actual.Engine.Href);
    }

    [Test]
    public async Task GetCurrentBuildAsync_ServalPreTranslationCompleted()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string buildDtoId = $"{Project01}.{Build01}";
        const string message = "Completed";
        const double percentCompleted = 0;
        const int revision = 43;
        const JobState state = JobState.Completed;
        env.TranslationEnginesClient
            .GetCurrentBuildAsync(TranslationEngine01, minRevision: null, CancellationToken.None)
            .Throws(ServalApiExceptions.NoContent);
        env.TranslationEnginesClient
            .GetAllBuildsAsync(TranslationEngine01, CancellationToken.None)
            .Returns(
                Task.FromResult<IList<TranslationBuild>>(
                    new List<TranslationBuild>
                    {
                        new TranslationBuild
                        {
                            Url = "https://example.com",
                            Id = Build01,
                            Engine = new ResourceLink { Id = "engineId", Url = "https://example.com" },
                            Message = message,
                            PercentCompleted = percentCompleted,
                            Revision = revision,
                            State = state,
                            DateFinished = DateTimeOffset.UtcNow,
                        },
                    }
                )
            );
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        ServalBuildDto? actual = await env.Service.GetCurrentBuildAsync(
            User01,
            Project01,
            minRevision: null,
            preTranslate: true,
            includeAdditionalInfo: false,
            CancellationToken.None
        );

        Assert.IsNotNull(actual);
        Assert.AreEqual(message, actual.Message);
        Assert.AreEqual(percentCompleted, actual.PercentCompleted);
        Assert.AreEqual(revision, actual.Revision);
        Assert.AreEqual(state.ToString().ToUpperInvariant(), actual.State);
        Assert.AreEqual(buildDtoId, actual.Id);
        Assert.AreEqual(MachineApi.GetBuildHref(Project01, Build01), actual.Href);
        Assert.AreEqual(Project01, actual.Engine.Id);
        Assert.AreEqual(MachineApi.GetEngineHref(Project01), actual.Engine.Href);
    }

    [Test]
    public void GetCurrentBuildAsync_ServalPreTranslationNoBuilds()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient
            .GetCurrentBuildAsync(TranslationEngine01, minRevision: null, CancellationToken.None)
            .Throws(ServalApiExceptions.NoContent);
        env.TranslationEnginesClient
            .GetAllBuildsAsync(TranslationEngine01, CancellationToken.None)
            .Returns(Task.FromResult<IList<TranslationBuild>>(new List<TranslationBuild>()));
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.GetCurrentBuildAsync(
                    User01,
                    Project01,
                    minRevision: null,
                    preTranslate: true,
                    includeAdditionalInfo: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public async Task GetCurrentBuildAsync_DoesNotExecuteInProcessIfBothEnabledForPreTranslations()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient
            .GetCurrentBuildAsync(TranslationEngine01, minRevision: null, CancellationToken.None)
            .Returns(Task.FromResult(new TranslationBuild()));

        // SUT
        _ = await env.Service.GetCurrentBuildAsync(
            User01,
            Project01,
            minRevision: null,
            preTranslate: true,
            includeAdditionalInfo: false,
            CancellationToken.None
        );

        await env.Builds
            .DidNotReceiveWithAnyArgs()
            .GetByLocatorAsync(BuildLocatorType.Engine, TranslationEngine01, CancellationToken.None);
        await env.TranslationEnginesClient
            .Received(1)
            .GetCurrentBuildAsync(TranslationEngine01, minRevision: null, CancellationToken.None);
    }

    [Test]
    public async Task GetCurrentBuildAsync_ExecutesOnlyInProcessIfBothEnabled()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        _ = await env.Service.GetCurrentBuildAsync(
            User01,
            Project01,
            minRevision: null,
            preTranslate: false,
            includeAdditionalInfo: false,
            CancellationToken.None
        );

        await env.Builds
            .Received(1)
            .GetByLocatorAsync(BuildLocatorType.Engine, TranslationEngine01, CancellationToken.None);
        await env.TranslationEnginesClient
            .DidNotReceiveWithAnyArgs()
            .GetCurrentBuildAsync(TranslationEngine01, minRevision: null, CancellationToken.None);
    }

    [Test]
    public void GetEngineAsync_NoFeatureFlagsEnabled()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.GetEngineAsync(User01, Project01, CancellationToken.None)
        );
    }

    [Test]
    public void GetEngineAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(
            () => env.Service.GetEngineAsync("invalid_user_id", Project01, CancellationToken.None)
        );
    }

    [Test]
    public void GetEngineAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.GetEngineAsync(User01, "invalid_project_id", CancellationToken.None)
        );
    }

    [Test]
    public void GetEngineAsync_InProcessNoEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));
        env.Engines
            .GetByLocatorAsync(EngineLocatorType.Project, Project01, CancellationToken.None)
            .Returns(Task.FromResult<Engine>(null));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.GetEngineAsync(User01, Project01, CancellationToken.None)
        );
    }

    [Test]
    public void GetEngineAsync_ServalApiExceptionFailsToInProcess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient
            .GetAsync(TranslationEngine01, CancellationToken.None)
            .Throws(ServalApiExceptions.InternalServerError);
        env.Engines
            .GetByLocatorAsync(EngineLocatorType.Project, Project01, CancellationToken.None)
            .Returns(Task.FromResult(new Engine()));

        // SUT
        _ = env.Service.GetEngineAsync(User01, Project01, CancellationToken.None);

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<ServalApiException>());
    }

    [Test]
    public void GetEngineAsync_ServalDoesNotOwnTranslationEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));
        env.TranslationEnginesClient
            .GetAsync(TranslationEngine01, CancellationToken.None)
            .Throws(ServalApiExceptions.Forbidden);

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(
            () => env.Service.GetEngineAsync(User01, Project01, CancellationToken.None)
        );
    }

    [Test]
    public void GetEngineAsync_ServalNoTranslationEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.GetEngineAsync(User01, Project03, CancellationToken.None)
        );
    }

    [Test]
    public void GetEngineAsync_ServalOutageNoInProcess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient
            .GetAsync(TranslationEngine01, CancellationToken.None)
            .Throws(new BrokenCircuitException());
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        Assert.ThrowsAsync<BrokenCircuitException>(
            () => env.Service.GetEngineAsync(User01, Project01, CancellationToken.None)
        );
    }

    [Test]
    public async Task GetEngineAsync_ServalOutageFailsToInProcess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient
            .GetAsync(TranslationEngine01, CancellationToken.None)
            .Throws(new BrokenCircuitException());
        env.Engines
            .GetByLocatorAsync(EngineLocatorType.Project, Project01, CancellationToken.None)
            .Returns(Task.FromResult(new Engine()));

        // SUT
        _ = await env.Service.GetEngineAsync(User01, Project01, CancellationToken.None);

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
    }

    [Test]
    public async Task GetEngineAsync_InProcessSuccess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string sourceLanguageTag = "en_US";
        const string targetLanguageTag = "en_NZ";
        const double confidence = 0.96;
        const int corpusSize = 472;
        env.Engines
            .GetByLocatorAsync(EngineLocatorType.Project, Project01, CancellationToken.None)
            .Returns(
                Task.FromResult(
                    new Engine
                    {
                        Confidence = confidence,
                        Id = Project01,
                        IsShared = false,
                        Revision = 1,
                        SourceLanguageTag = sourceLanguageTag,
                        TargetLanguageTag = targetLanguageTag,
                        TrainedSegmentCount = corpusSize,
                    }
                )
            );
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));

        // SUT
        EngineDto actual = await env.Service.GetEngineAsync(User01, Project01, CancellationToken.None);

        Assert.AreEqual(confidence, actual.Confidence);
        Assert.AreEqual(corpusSize, actual.TrainedSegmentCount);
        Assert.AreEqual(sourceLanguageTag, actual.SourceLanguageTag);
        Assert.AreEqual(targetLanguageTag, actual.TargetLanguageTag);
        Assert.IsFalse(actual.IsShared);
        Assert.AreEqual(MachineApi.GetEngineHref(Project01), actual.Href);
        Assert.AreEqual(1, actual.Projects.Length);
        Assert.AreEqual(Project01, actual.Projects.First().Id);
        Assert.AreEqual(MachineApi.GetEngineHref(Project01), actual.Projects.First().Href);
    }

    [Test]
    public async Task GetEngineAsync_ServalSuccess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string sourceLanguageTag = "en_US";
        const string targetLanguageTag = "en_NZ";
        const double confidence = 96.0;
        const int corpusSize = 472;
        env.TranslationEnginesClient
            .GetAsync(TranslationEngine01, CancellationToken.None)
            .Returns(
                Task.FromResult(
                    new TranslationEngine
                    {
                        Confidence = confidence,
                        CorpusSize = corpusSize,
                        Url = "https://example.com",
                        Id = Project01,
                        IsBuilding = true,
                        ModelRevision = 1,
                        Name = "my_translation_engine",
                        SourceLanguage = sourceLanguageTag,
                        TargetLanguage = targetLanguageTag,
                        Type = MachineProjectService.SmtTransfer,
                    }
                )
            );
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        EngineDto actual = await env.Service.GetEngineAsync(User01, Project01, CancellationToken.None);

        Assert.AreEqual(confidence / 100.0, actual.Confidence);
        Assert.AreEqual(corpusSize, actual.TrainedSegmentCount);
        Assert.AreEqual(sourceLanguageTag, actual.SourceLanguageTag);
        Assert.AreEqual(targetLanguageTag, actual.TargetLanguageTag);
        Assert.IsFalse(actual.IsShared);
        Assert.AreEqual(MachineApi.GetEngineHref(Project01), actual.Href);
        Assert.AreEqual(1, actual.Projects.Length);
        Assert.AreEqual(Project01, actual.Projects.First().Id);
        Assert.AreEqual(MachineApi.GetEngineHref(Project01), actual.Projects.First().Href);
    }

    [Test]
    public async Task GetEngineAsync_ExecutesApiAndInProcess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient
            .GetAsync(TranslationEngine01, CancellationToken.None)
            .Returns(Task.FromResult(new TranslationEngine()));
        env.Engines
            .GetByLocatorAsync(EngineLocatorType.Project, Project01, CancellationToken.None)
            .Returns(Task.FromResult(new Engine()));

        // SUT
        _ = await env.Service.GetEngineAsync(User01, Project01, CancellationToken.None);

        await env.Engines.Received(1).GetByLocatorAsync(EngineLocatorType.Project, Project01, CancellationToken.None);
        await env.TranslationEnginesClient.Received(1).GetAsync(TranslationEngine01, CancellationToken.None);
    }

    [Test]
    public async Task GetLastCompletedPreTranslationBuildAsync_NoCompletedBuild()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient
            .GetAllBuildsAsync(TranslationEngine01, CancellationToken.None)
            .Returns(
                Task.FromResult<IList<TranslationBuild>>(
                    new List<TranslationBuild>
                    {
                        new TranslationBuild
                        {
                            Url = "https://example.com",
                            Id = Build01,
                            Engine = new ResourceLink { Id = "engineId", Url = "https://example.com" },
                            Message = string.Empty,
                            PercentCompleted = 0,
                            Revision = 0,
                            State = JobState.Faulted,
                        },
                    }
                )
            );

        // SUT
        ServalBuildDto? actual = await env.Service.GetLastCompletedPreTranslationBuildAsync(
            User01,
            Project01,
            includeAdditionalInfo: false,
            CancellationToken.None
        );

        Assert.IsNull(actual);
    }

    [Test]
    public void GetLastCompletedPreTranslationBuildAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(
            () =>
                env.Service.GetLastCompletedPreTranslationBuildAsync(
                    "invalid_user_id",
                    Project01,
                    includeAdditionalInfo: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public void GetLastCompletedPreTranslationBuildAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.GetLastCompletedPreTranslationBuildAsync(
                    User01,
                    "invalid_project_id",
                    includeAdditionalInfo: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public void GetLastCompletedPreTranslationBuildAsync_NoFeatureFlagEnabled()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.GetLastCompletedPreTranslationBuildAsync(
                    User01,
                    Project01,
                    includeAdditionalInfo: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public void GetLastCompletedPreTranslationBuildAsync_NoTranslationEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.GetLastCompletedPreTranslationBuildAsync(
                    User01,
                    Project03,
                    includeAdditionalInfo: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public void GetLastCompletedPreTranslationBuildAsync_ServalDown()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient.GetAllBuildsAsync(TranslationEngine01).Throws(new BrokenCircuitException());

        // SUT
        Assert.ThrowsAsync<BrokenCircuitException>(
            () =>
                env.Service.GetLastCompletedPreTranslationBuildAsync(
                    User01,
                    Project01,
                    includeAdditionalInfo: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public async Task GetLastCompletedPreTranslationBuildAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string buildDtoId = $"{Project01}.{Build01}";
        const string message = "Completed";
        const double percentCompleted = 0;
        const int revision = 43;
        const JobState state = JobState.Completed;
        env.TranslationEnginesClient
            .GetAllBuildsAsync(TranslationEngine01, CancellationToken.None)
            .Returns(
                Task.FromResult<IList<TranslationBuild>>(
                    new List<TranslationBuild>
                    {
                        new TranslationBuild
                        {
                            Url = "https://example.com",
                            Id = Build01,
                            Engine = new ResourceLink { Id = "engineId", Url = "https://example.com" },
                            Message = message,
                            PercentCompleted = percentCompleted,
                            Revision = revision,
                            State = state,
                            DateFinished = DateTimeOffset.UtcNow,
                        },
                    }
                )
            );

        // SUT
        ServalBuildDto? actual = await env.Service.GetLastCompletedPreTranslationBuildAsync(
            User01,
            Project01,
            includeAdditionalInfo: false,
            CancellationToken.None
        );

        Assert.IsNotNull(actual);
        Assert.AreEqual(message, actual.Message);
        Assert.AreEqual(percentCompleted, actual.PercentCompleted);
        Assert.AreEqual(revision, actual.Revision);
        Assert.AreEqual(state.ToString().ToUpperInvariant(), actual.State);
        Assert.AreEqual(buildDtoId, actual.Id);
        Assert.AreEqual(MachineApi.GetBuildHref(Project01, Build01), actual.Href);
        Assert.AreEqual(Project01, actual.Engine.Id);
        Assert.AreEqual(MachineApi.GetEngineHref(Project01), actual.Engine.Href);
    }

    [Test]
    public void GetPreTranslationAsync_EngineNotBuilt()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.PreTranslationService
            .GetPreTranslationsAsync(User01, Project01, 40, 1, CancellationToken.None)
            .Throws(ServalApiExceptions.EngineNotBuilt);

        // SUT
        Assert.ThrowsAsync<InvalidOperationException>(
            () => env.Service.GetPreTranslationAsync(User01, Project01, 40, 1, CancellationToken.None)
        );
    }

    [Test]
    public void GetPreTranslationAsync_NoFeatureFlagEnabled()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.GetPreTranslationAsync(User01, Project01, 40, 1, CancellationToken.None)
        );
    }

    [Test]
    public void GetPreTranslationAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(
            () => env.Service.GetPreTranslationAsync("invalid_user_id", Project01, 40, 1, CancellationToken.None)
        );
    }

    [Test]
    public void GetPreTranslationAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.GetPreTranslationAsync(User01, "invalid_project_id", 40, 1, CancellationToken.None)
        );
    }

    [Test]
    public void GetPreTranslationAsync_ServalDown()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.PreTranslationService
            .GetPreTranslationsAsync(User01, Project01, 40, 1, CancellationToken.None)
            .Throws(new BrokenCircuitException());

        // SUT
        Assert.ThrowsAsync<BrokenCircuitException>(
            () => env.Service.GetPreTranslationAsync(User01, Project01, 40, 1, CancellationToken.None)
        );
    }

    [Test]
    public async Task GetPreTranslationAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string reference = "MAT 1:1";
        const string translation = "The book of the generations of Jesus Christ, the son of David, the son of Abraham.";
        env.PreTranslationService
            .GetPreTranslationsAsync(User01, Project01, 40, 1, CancellationToken.None)
            .Returns(
                Task.FromResult(
                    new PreTranslation[]
                    {
                        new PreTranslation { Reference = reference, Translation = translation, },
                    }
                )
            );

        // SUT
        PreTranslationDto actual = await env.Service.GetPreTranslationAsync(
            User01,
            Project01,
            40,
            1,
            CancellationToken.None
        );
        Assert.IsNotNull(actual);
        Assert.AreEqual(reference, actual.PreTranslations.First().Reference);
        Assert.AreEqual(translation, actual.PreTranslations.First().Translation);
    }

    [Test]
    public void GetWordGraphAsync_NoFeatureFlagsEnabled()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.GetWordGraphAsync(User01, Project01, Segment, CancellationToken.None)
        );
    }

    [Test]
    public void GetWordGraphAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(
            () => env.Service.GetWordGraphAsync("invalid_user_id", Project01, Segment, CancellationToken.None)
        );
    }

    [Test]
    public void GetWordGraphAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.GetWordGraphAsync(User01, "invalid_project_id", Segment, CancellationToken.None)
        );
    }

    [Test]
    public void GetWordGraphAsync_InProcessNoEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));
        env.Engines
            .GetByLocatorAsync(EngineLocatorType.Project, Project01, CancellationToken.None)
            .Returns(Task.FromResult<Engine>(null));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.GetWordGraphAsync(User01, Project01, Segment, CancellationToken.None)
        );
    }

    [Test]
    public void GetWordGraphAsync_ServalNoTranslationEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.GetWordGraphAsync(User01, Project03, Segment, CancellationToken.None)
        );
    }

    [Test]
    public void GetWordGraphAsync_ServalOutageNoInProcess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient
            .GetWordGraphAsync(TranslationEngine01, Segment, CancellationToken.None)
            .Throws(new BrokenCircuitException());
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        Assert.ThrowsAsync<BrokenCircuitException>(
            () => env.Service.GetWordGraphAsync(User01, Project01, Segment, CancellationToken.None)
        );
    }

    [Test]
    public async Task GetWordGraphAsync_ServalApiExceptionFailsToInProcess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient
            .GetWordGraphAsync(TranslationEngine01, Segment, CancellationToken.None)
            .Throws(ServalApiExceptions.EngineNotBuilt);
        env.EngineService
            .GetWordGraphAsync(TranslationEngine01, Arg.Is<string[]>(s => s.Length == 1 && s.First() == Segment))
            .Returns(Task.FromResult(new MachineWordGraph(Array.Empty<MachineWordGraphArc>(), Array.Empty<int>())));

        // SUT
        _ = await env.Service.GetWordGraphAsync(User01, Project01, Segment, CancellationToken.None);

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<ServalApiException>());
    }

    [Test]
    public async Task GetWordGraphAsync_ServalOutageFailsToInProcess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient
            .GetWordGraphAsync(TranslationEngine01, Segment, CancellationToken.None)
            .Throws(new BrokenCircuitException());
        env.EngineService
            .GetWordGraphAsync(TranslationEngine01, Arg.Is<string[]>(s => s.Length == 1 && s.First() == Segment))
            .Returns(Task.FromResult(new MachineWordGraph(Array.Empty<MachineWordGraphArc>(), Array.Empty<int>())));

        // SUT
        _ = await env.Service.GetWordGraphAsync(User01, Project01, Segment, CancellationToken.None);

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
    }

    [Test]
    public async Task GetWordGraphAsync_InProcessSuccess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const float initialStateScore = -91.43696f;
        env.EngineService
            .GetWordGraphAsync(TranslationEngine01, Arg.Is<string[]>(s => s.Length == 1 && s.First() == Segment))
            .Returns(
                Task.FromResult(
                    new MachineWordGraph(
                        new[]
                        {
                            new MachineWordGraphArc(
                                0,
                                0,
                                0.0,
                                Array.Empty<string>(),
                                new WordAlignmentMatrix(0, 0),
                                Range<int>.Null,
                                Array.Empty<TranslationSources>()
                            ),
                        },
                        new[] { 1 },
                        initialStateScore
                    )
                )
            );
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));

        // SUT
        WordGraph actual = await env.Service.GetWordGraphAsync(User01, Project01, Segment, CancellationToken.None);

        Assert.IsNotNull(actual);
        Assert.AreEqual(initialStateScore, actual.InitialStateScore);
        Assert.AreEqual(1, actual.Arcs.Count);
        Assert.AreEqual(1, actual.FinalStates.Count);
    }

    [Test]
    public async Task GetWordGraphAsync_ServalSuccess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const float initialStateScore = -91.43696f;
        env.TranslationEnginesClient
            .GetWordGraphAsync(TranslationEngine01, Segment, CancellationToken.None)
            .Returns(
                Task.FromResult(
                    new WordGraph
                    {
                        Arcs = new[] { new WordGraphArc() },
                        FinalStates = new[] { 1 },
                        InitialStateScore = initialStateScore,
                        SourceTokens = new[] { Segment },
                    }
                )
            );
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        WordGraph actual = await env.Service.GetWordGraphAsync(User01, Project01, Segment, CancellationToken.None);

        Assert.IsNotNull(actual);
        Assert.AreEqual(initialStateScore, actual.InitialStateScore);
        Assert.AreEqual(1, actual.Arcs.Count);
        Assert.AreEqual(1, actual.FinalStates.Count);
    }

    [Test]
    public async Task GetWordGraphAsync_ExecutesApiAndInProcess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient
            .GetWordGraphAsync(TranslationEngine01, Segment)
            .Returns(Task.FromResult(new WordGraph()));
        env.EngineService
            .GetWordGraphAsync(TranslationEngine01, Arg.Is<string[]>(s => s.Length == 1 && s.First() == Segment))
            .Returns(Task.FromResult(new MachineWordGraph()));

        // SUT
        _ = await env.Service.GetWordGraphAsync(User01, Project01, Segment, CancellationToken.None);

        await env.EngineService
            .Received(1)
            .GetWordGraphAsync(TranslationEngine01, Arg.Is<string[]>(s => s.Length == 1 && s.First() == Segment));
        await env.TranslationEnginesClient
            .Received(1)
            .GetWordGraphAsync(TranslationEngine01, Segment, CancellationToken.None);
    }

    [Test]
    public void GetWordGraph_EngineNotBuilt()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient
            .GetWordGraphAsync(TranslationEngine01, Segment)
            .Throws(ServalApiExceptions.EngineNotBuilt);
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        Assert.ThrowsAsync<InvalidOperationException>(
            () => env.Service.GetWordGraphAsync(User01, Project01, Segment, CancellationToken.None)
        );
    }

    [Test]
    public async Task GetPreTranslationQueuedStateAsync_BuildCrashed()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string errorMessage = "This is an error message from Serval";
        await env.QueuePreTranslationBuildAsync(DateTime.UtcNow.AddHours(-6), errorMessage);

        // SUT
        ServalBuildDto? build = await env.Service.GetPreTranslationQueuedStateAsync(
            User01,
            Project01,
            CancellationToken.None
        );
        Assert.AreEqual(MachineApiService.BuildStateFaulted, build?.State);
        Assert.AreEqual(errorMessage, build.Message);
    }

    [Test]
    public async Task GetPreTranslationQueuedStateAsync_BuildRunTooLong()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.QueuePreTranslationBuildAsync(DateTime.UtcNow.AddHours(-6));

        // SUT
        ServalBuildDto? build = await env.Service.GetPreTranslationQueuedStateAsync(
            User01,
            Project01,
            CancellationToken.None
        );
        Assert.AreEqual(MachineApiService.BuildStateFaulted, build?.State);
    }

    [Test]
    public async Task GetPreTranslationQueuedStateAsync_BuildQueued()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.QueuePreTranslationBuildAsync();

        // SUT
        ServalBuildDto? build = await env.Service.GetPreTranslationQueuedStateAsync(
            User01,
            Project01,
            CancellationToken.None
        );
        Assert.AreEqual(MachineApiService.BuildStateQueued, build?.State);
    }

    [Test]
    public async Task GetPreTranslationQueuedStateAsync_NoBuildQueued()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        ServalBuildDto? build = await env.Service.GetPreTranslationQueuedStateAsync(
            User01,
            Project01,
            CancellationToken.None
        );
        Assert.IsNull(build);
    }

    [Test]
    public void StartBuildAsync_NoFeatureFlagsEnabled()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.StartBuildAsync(User01, Project01, includeAdditionalInfo: false, CancellationToken.None)
        );
    }

    [Test]
    public void StartBuildAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(
            () =>
                env.Service.StartBuildAsync(
                    "invalid_user_id",
                    Project01,
                    includeAdditionalInfo: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public void StartBuildAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.StartBuildAsync(
                    User01,
                    "invalid_project_id",
                    includeAdditionalInfo: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public void StartBuildAsync_InProcessNoEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));
        env.Engines
            .GetByLocatorAsync(EngineLocatorType.Project, Project01, CancellationToken.None)
            .Returns(Task.FromResult<Engine>(null));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.StartBuildAsync(User01, Project01, includeAdditionalInfo: false, CancellationToken.None)
        );
    }

    [Test]
    public async Task StartBuildAsync_ServalCreatesRemovedTranslationEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineProjectService
            .AddProjectAsync(User01, Project01, preTranslate: false, CancellationToken.None)
            .Returns(Task.FromResult(TranslationEngine01));
        env.TranslationEnginesClient
            .StartBuildAsync(TranslationEngine01, Arg.Any<TranslationBuildConfig>(), CancellationToken.None)
            .Returns(
                Task.FromResult(
                    new TranslationBuild
                    {
                        Url = "https://example.com",
                        Id = Build01,
                        Engine = new ResourceLink { Id = "engineId", Url = "https://example.com" },
                        State = JobState.Active,
                    }
                )
            );
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));
        // The following substitution is Serval stating that a translation engine SF expects to exist has been removed
        env.MachineProjectService
            .TranslationEngineExistsAsync(Project01, TranslationEngine01, preTranslate: false, CancellationToken.None)
            .Returns(Task.FromResult(false));

        // SUT
        await env.Service.StartBuildAsync(User01, Project01, includeAdditionalInfo: false, CancellationToken.None);

        await env.MachineProjectService
            .Received(1)
            .AddProjectAsync(User01, Project01, preTranslate: false, CancellationToken.None);
    }

    [Test]
    public async Task StartBuildAsync_ServalTranslationEngineRecreationErrorsDoNotCrashIfInProcess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.EngineService.StartBuildAsync(TranslationEngine01).Returns(Task.FromResult(new Build()));
        env.MachineProjectService
            .TranslationEngineExistsAsync(Project01, TranslationEngine01, preTranslate: false, CancellationToken.None)
            .Throws(ServalApiExceptions.InternalServerError);
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(true));

        // SUT
        await env.Service.StartBuildAsync(User01, Project01, includeAdditionalInfo: false, CancellationToken.None);

        await env.MachineProjectService
            .DidNotReceiveWithAnyArgs()
            .AddProjectAsync(User01, Project01, preTranslate: false, CancellationToken.None);
        await env.TranslationEnginesClient
            .DidNotReceiveWithAnyArgs()
            .StartBuildAsync(TranslationEngine01, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
        await env.EngineService.Received(1).StartBuildAsync(TranslationEngine01);
    }

    [Test]
    public async Task StartBuildAsync_ServalCreatesMissingTranslationEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineProjectService
            .AddProjectAsync(User01, Project03, preTranslate: false, CancellationToken.None)
            .Returns(Task.FromResult(TranslationEngine01));
        env.TranslationEnginesClient
            .StartBuildAsync(TranslationEngine01, Arg.Any<TranslationBuildConfig>(), CancellationToken.None)
            .Returns(
                Task.FromResult(
                    new TranslationBuild
                    {
                        Url = "https://example.com",
                        Id = Build01,
                        Engine = new ResourceLink { Id = "engineId", Url = "https://example.com" },
                        State = JobState.Active,
                    }
                )
            );
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        await env.Service.StartBuildAsync(User01, Project03, includeAdditionalInfo: false, CancellationToken.None);

        await env.MachineProjectService
            .Received(1)
            .AddProjectAsync(User01, Project03, preTranslate: false, CancellationToken.None);
    }

    [Test]
    public void StartBuildAsync_ServalNoTranslationEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.StartBuildAsync(User01, Project03, includeAdditionalInfo: false, CancellationToken.None)
        );
    }

    [Test]
    public void StartBuildAsync_ServalOutageNoInProcess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient
            .StartBuildAsync(TranslationEngine01, Arg.Any<TranslationBuildConfig>(), CancellationToken.None)
            .Throws(new BrokenCircuitException());
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        Assert.ThrowsAsync<BrokenCircuitException>(
            () => env.Service.StartBuildAsync(User01, Project01, includeAdditionalInfo: false, CancellationToken.None)
        );
    }

    [Test]
    public async Task StartBuildAsync_ServalApiExceptionFailsToInProcess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient
            .StartBuildAsync(TranslationEngine01, Arg.Any<TranslationBuildConfig>(), CancellationToken.None)
            .Throws(ServalApiExceptions.Forbidden);
        env.EngineService.StartBuildAsync(TranslationEngine01).Returns(Task.FromResult(new Build()));

        // SUT
        _ = await env.Service.StartBuildAsync(User01, Project01, includeAdditionalInfo: false, CancellationToken.None);

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<ServalApiException>());
    }

    [Test]
    public async Task StartBuildAsync_ServalOutageFailsToInProcess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient
            .StartBuildAsync(TranslationEngine01, Arg.Any<TranslationBuildConfig>(), CancellationToken.None)
            .Throws(new BrokenCircuitException());
        env.EngineService.StartBuildAsync(TranslationEngine01).Returns(Task.FromResult(new Build()));

        // SUT
        _ = await env.Service.StartBuildAsync(User01, Project01, includeAdditionalInfo: false, CancellationToken.None);

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
    }

    [Test]
    public async Task StartBuildAsync_InProcessSuccess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string buildDtoId = $"{Project01}.{Build01}";
        const string message = "Training language model";
        const double percentCompleted = 0.01;
        const int revision = 2;
        const string state = "ACTIVE";
        env.EngineService
            .StartBuildAsync(TranslationEngine01)
            .Returns(
                Task.FromResult(
                    new Build
                    {
                        Id = Build01,
                        Message = message,
                        PercentCompleted = percentCompleted,
                        Revision = revision,
                        State = state,
                    }
                )
            );
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));

        // SUT
        ServalBuildDto actual = await env.Service.StartBuildAsync(
            User01,
            Project01,
            includeAdditionalInfo: false,
            CancellationToken.None
        );

        Assert.AreEqual(message, actual.Message);
        Assert.AreEqual(percentCompleted, actual.PercentCompleted);
        Assert.AreEqual(revision, actual.Revision);
        Assert.AreEqual(state, actual.State);
        Assert.AreEqual(buildDtoId, actual.Id);
        Assert.AreEqual(MachineApi.GetBuildHref(Project01, Build01), actual.Href);
        Assert.AreEqual(Project01, actual.Engine.Id);
        Assert.AreEqual(MachineApi.GetEngineHref(Project01), actual.Engine.Href);
    }

    [Test]
    public async Task StartBuildAsync_ServalSuccess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string buildDtoId = $"{Project01}.{Build01}";
        const string message = "Training language model";
        const double percentCompleted = 0.01;
        const int revision = 2;
        const JobState state = JobState.Active;
        env.TranslationEnginesClient
            .StartBuildAsync(TranslationEngine01, Arg.Any<TranslationBuildConfig>(), CancellationToken.None)
            .Returns(
                Task.FromResult(
                    new TranslationBuild
                    {
                        Url = "https://example.com",
                        Id = Build01,
                        Engine = new ResourceLink { Id = "engineId", Url = "https://example.com" },
                        Message = message,
                        PercentCompleted = percentCompleted,
                        Revision = revision,
                        State = state,
                    }
                )
            );
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        ServalBuildDto actual = await env.Service.StartBuildAsync(
            User01,
            Project01,
            includeAdditionalInfo: false,
            CancellationToken.None
        );

        await env.MachineProjectService
            .Received(1)
            .SyncProjectCorporaAsync(
                User01,
                Arg.Is<BuildConfig>(b => b.ProjectId == Project01),
                preTranslate: false,
                CancellationToken.None
            );
        Assert.AreEqual(message, actual.Message);
        Assert.AreEqual(percentCompleted, actual.PercentCompleted);
        Assert.AreEqual(revision, actual.Revision);
        Assert.AreEqual(state.ToString().ToUpperInvariant(), actual.State);
        Assert.AreEqual(buildDtoId, actual.Id);
        Assert.AreEqual(MachineApi.GetBuildHref(Project01, Build01), actual.Href);
        Assert.AreEqual(Project01, actual.Engine.Id);
        Assert.AreEqual(MachineApi.GetEngineHref(Project01), actual.Engine.Href);
    }

    [Test]
    public async Task StartBuildAsync_ExecutesApiAndInProcess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient
            .StartBuildAsync(TranslationEngine01, Arg.Any<TranslationBuildConfig>(), CancellationToken.None)
            .Returns(Task.FromResult(new TranslationBuild()));
        env.EngineService.StartBuildAsync(TranslationEngine01).Returns(Task.FromResult(new Build()));

        // SUT
        _ = await env.Service.StartBuildAsync(User01, Project01, includeAdditionalInfo: false, CancellationToken.None);

        await env.EngineService.Received(1).StartBuildAsync(TranslationEngine01);
        await env.MachineProjectService
            .Received(1)
            .SyncProjectCorporaAsync(
                User01,
                Arg.Is<BuildConfig>(b => b.ProjectId == Project01),
                preTranslate: false,
                CancellationToken.None
            );
        await env.TranslationEnginesClient
            .Received(1)
            .StartBuildAsync(TranslationEngine01, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
    }

    [Test]
    public async Task StartPreTranslationBuildAsync_AlternateSource()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        await env.Service.StartPreTranslationBuildAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            CancellationToken.None
        );

        await env.SyncService
            .Received(1)
            .SyncAsync(Arg.Is<SyncConfig>(s => s.ProjectId == Project03 && s.TargetOnly && s.UserId == User01));
        env.BackgroundJobClient.Received(1).Create(Arg.Any<Job>(), Arg.Any<IState>());
        Assert.AreEqual(JobId, env.ProjectSecrets.Get(Project02).ServalData!.PreTranslationJobId);
        Assert.IsNotNull(env.ProjectSecrets.Get(Project02).ServalData?.PreTranslationQueuedAt);
        Assert.IsNull(env.ProjectSecrets.Get(Project02).ServalData?.PreTranslationErrorMessage);
    }

    [Test]
    public async Task StartPreTranslationBuildAsync_AlternateSourceAndAlternateTrainingSource()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.Projects.UpdateAsync(
            p => p.Id == Project02,
            u =>
                u.Set(
                    s => s.TranslateConfig.DraftConfig,
                    new DraftConfig
                    {
                        AlternateSource = new TranslateSource { ProjectRef = Project03, },
                        AlternateTrainingSourceEnabled = true,
                        AlternateTrainingSource = new TranslateSource { ProjectRef = Project01 },
                    }
                )
        );

        // SUT
        await env.Service.StartPreTranslationBuildAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            CancellationToken.None
        );

        await env.SyncService
            .Received(1)
            .SyncAsync(Arg.Is<SyncConfig>(s => s.ProjectId == Project03 && s.TargetOnly && s.UserId == User01));
        await env.SyncService
            .Received(1)
            .SyncAsync(Arg.Is<SyncConfig>(s => s.ProjectId == Project01 && s.TargetOnly && s.UserId == User01));
        env.BackgroundJobClient.Received(1).Create(Arg.Any<Job>(), Arg.Any<IState>());
        Assert.AreEqual(JobId, env.ProjectSecrets.Get(Project02).ServalData!.PreTranslationJobId);
        Assert.IsNotNull(env.ProjectSecrets.Get(Project02).ServalData?.PreTranslationQueuedAt);
        Assert.IsNull(env.ProjectSecrets.Get(Project02).ServalData?.PreTranslationErrorMessage);
    }

    [Test]
    public void StartPreTranslationBuildAsync_NoFeatureFlagEnabled()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.StartPreTranslationBuildAsync(
                    User01,
                    new BuildConfig { ProjectId = Project01 },
                    CancellationToken.None
                )
        );
    }

    [Test]
    public void StartPreTranslationBuildAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(
            () =>
                env.Service.StartPreTranslationBuildAsync(
                    "invalid_user_id",
                    new BuildConfig { ProjectId = Project01 },
                    CancellationToken.None
                )
        );
    }

    [Test]
    public void StartPreTranslationBuildAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.StartPreTranslationBuildAsync(
                    User01,
                    new BuildConfig { ProjectId = "invalid_project_id" },
                    CancellationToken.None
                )
        );
    }

    [Test]
    public async Task StartPreTranslationBuildAsync_SuccessNoTrainingOrTranslationBooks()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        await env.Service.StartPreTranslationBuildAsync(
            User01,
            new BuildConfig { ProjectId = Project01 },
            CancellationToken.None
        );

        env.BackgroundJobClient.Received(1).Create(Arg.Any<Job>(), Arg.Any<IState>());
        Assert.AreEqual(JobId, env.ProjectSecrets.Get(Project01).ServalData!.PreTranslationJobId);
        Assert.IsNotNull(env.ProjectSecrets.Get(Project01).ServalData?.PreTranslationQueuedAt);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData?.PreTranslationErrorMessage);
        Assert.IsEmpty(env.Projects.Get(Project01).TranslateConfig.DraftConfig.LastSelectedTrainingBooks);
    }

    [Test]
    public async Task StartPreTranslationBuildAsync_SuccessWithTranslationBooks()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        await env.Service.StartPreTranslationBuildAsync(
            User01,
            new BuildConfig { ProjectId = Project01, TranslationBooks = { 1, 2 } },
            CancellationToken.None
        );

        env.BackgroundJobClient.Received(1).Create(Arg.Any<Job>(), Arg.Any<IState>());
        Assert.AreEqual(JobId, env.ProjectSecrets.Get(Project01).ServalData!.PreTranslationJobId);
        Assert.IsNotNull(env.ProjectSecrets.Get(Project01).ServalData?.PreTranslationQueuedAt);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData?.PreTranslationErrorMessage);
        Assert.AreEqual(0, env.Projects.Get(Project01).TranslateConfig.DraftConfig.LastSelectedTrainingBooks.Count);
        Assert.AreEqual(2, env.Projects.Get(Project01).TranslateConfig.DraftConfig.LastSelectedTranslationBooks.Count);
        Assert.AreEqual(
            1,
            env.Projects.Get(Project01).TranslateConfig.DraftConfig.LastSelectedTranslationBooks.First()
        );
        Assert.AreEqual(2, env.Projects.Get(Project01).TranslateConfig.DraftConfig.LastSelectedTranslationBooks.Last());
    }

    [Test]
    public async Task StartPreTranslationBuildAsync_SuccessWithTrainingAndTranslationBooks()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        await env.Service.StartPreTranslationBuildAsync(
            User01,
            new BuildConfig
            {
                ProjectId = Project01,
                TrainingBooks = { 1, 2 },
                TranslationBooks = { 3, 4 }
            },
            CancellationToken.None
        );

        env.BackgroundJobClient.Received(1).Create(Arg.Any<Job>(), Arg.Any<IState>());
        Assert.AreEqual(JobId, env.ProjectSecrets.Get(Project01).ServalData!.PreTranslationJobId);
        Assert.IsNotNull(env.ProjectSecrets.Get(Project01).ServalData?.PreTranslationQueuedAt);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData?.PreTranslationErrorMessage);
        Assert.AreEqual(2, env.Projects.Get(Project01).TranslateConfig.DraftConfig.LastSelectedTrainingBooks.Count);
        Assert.AreEqual(1, env.Projects.Get(Project01).TranslateConfig.DraftConfig.LastSelectedTrainingBooks.First());
        Assert.AreEqual(2, env.Projects.Get(Project01).TranslateConfig.DraftConfig.LastSelectedTrainingBooks.Last());
        Assert.AreEqual(2, env.Projects.Get(Project01).TranslateConfig.DraftConfig.LastSelectedTranslationBooks.Count);
        Assert.AreEqual(
            3,
            env.Projects.Get(Project01).TranslateConfig.DraftConfig.LastSelectedTranslationBooks.First()
        );
        Assert.AreEqual(4, env.Projects.Get(Project01).TranslateConfig.DraftConfig.LastSelectedTranslationBooks.Last());
    }

    [Test]
    public async Task StartPreTranslationBuildAsync_AlternateTrainingSource()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.Projects.UpdateAsync(
            p => p.Id == Project02,
            u =>
                u.Set(
                    s => s.TranslateConfig.DraftConfig,
                    new DraftConfig
                    {
                        AlternateTrainingSourceEnabled = true,
                        AlternateTrainingSource = new TranslateSource { ProjectRef = Project01 },
                    }
                )
        );

        // SUT
        await env.Service.StartPreTranslationBuildAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            CancellationToken.None
        );

        await env.SyncService
            .Received(1)
            .SyncAsync(Arg.Is<SyncConfig>(s => s.ProjectId == Project01 && s.TargetOnly && s.UserId == User01));
        env.BackgroundJobClient.Received(1).Create(Arg.Any<Job>(), Arg.Any<IState>());
        Assert.AreEqual(JobId, env.ProjectSecrets.Get(Project02).ServalData!.PreTranslationJobId);
        Assert.IsNotNull(env.ProjectSecrets.Get(Project02).ServalData?.PreTranslationQueuedAt);
        Assert.IsNull(env.ProjectSecrets.Get(Project02).ServalData?.PreTranslationErrorMessage);
    }

    [Test]
    public void TrainSegmentAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(
            () => env.Service.TrainSegmentAsync("invalid_user_id", Project01, new SegmentPair(), CancellationToken.None)
        );
    }

    [Test]
    public void TrainSegmentAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.TrainSegmentAsync(User01, "invalid_project_id", new SegmentPair(), CancellationToken.None)
        );
    }

    [Test]
    public void TrainSegmentAsync_InProcessNoEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));
        env.Engines
            .GetByLocatorAsync(EngineLocatorType.Project, Project01, CancellationToken.None)
            .Returns(Task.FromResult<Engine>(null));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.TrainSegmentAsync(User01, Project01, new SegmentPair(), CancellationToken.None)
        );
    }

    [Test]
    public void TrainSegmentAsync_ServalNoTranslationEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.TrainSegmentAsync(User01, Project03, new SegmentPair(), CancellationToken.None)
        );
    }

    [Test]
    public void TrainSegmentAsync_ServalOutageNoInProcess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient
            .TrainSegmentAsync(TranslationEngine01, Arg.Any<SegmentPair>(), CancellationToken.None)
            .Throws(new BrokenCircuitException());
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        Assert.ThrowsAsync<BrokenCircuitException>(
            () => env.Service.TrainSegmentAsync(User01, Project01, new SegmentPair(), CancellationToken.None)
        );
    }

    [Test]
    public async Task TrainSegmentAsync_ServalApiExceptionFailsToInProcess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var segmentPair = new SegmentPair
        {
            SentenceStart = false,
            SourceSegment = Segment,
            TargetSegment = TargetSegment,
        };
        env.TranslationEnginesClient
            .TrainSegmentAsync(TranslationEngine01, Arg.Any<SegmentPair>(), CancellationToken.None)
            .Throws(ServalApiExceptions.InternalServerError);
        env.EngineService
            .TrainSegmentAsync(
                TranslationEngine01,
                Arg.Is<string[]>(s => s.Length == 1 && s.First() == segmentPair.SourceSegment),
                Arg.Is<string[]>(s => s.Length == 1 && s.First() == segmentPair.TargetSegment),
                segmentPair.SentenceStart
            )
            .Returns(Task.FromResult(true));

        // SUT
        await env.Service.TrainSegmentAsync(User01, Project01, segmentPair, CancellationToken.None);

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<ServalApiException>());
    }

    [Test]
    public async Task TrainSegmentAsync_ServalOutageFailsToInProcess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var segmentPair = new SegmentPair
        {
            SentenceStart = false,
            SourceSegment = Segment,
            TargetSegment = TargetSegment,
        };
        env.TranslationEnginesClient
            .TrainSegmentAsync(TranslationEngine01, Arg.Any<SegmentPair>(), CancellationToken.None)
            .Throws(new BrokenCircuitException());
        env.EngineService
            .TrainSegmentAsync(
                TranslationEngine01,
                Arg.Is<string[]>(s => s.Length == 1 && s.First() == segmentPair.SourceSegment),
                Arg.Is<string[]>(s => s.Length == 1 && s.First() == segmentPair.TargetSegment),
                segmentPair.SentenceStart
            )
            .Returns(Task.FromResult(true));

        // SUT
        await env.Service.TrainSegmentAsync(User01, Project01, segmentPair, CancellationToken.None);

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
    }

    [Test]
    public async Task TrainSegmentAsync_InProcessSuccess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));
        var segmentPair = new SegmentPair
        {
            SentenceStart = false,
            SourceSegment = Segment,
            TargetSegment = TargetSegment,
        };

        // SUT
        await env.Service.TrainSegmentAsync(User01, Project01, segmentPair, CancellationToken.None);

        await env.EngineService
            .Received(1)
            .TrainSegmentAsync(
                TranslationEngine01,
                Arg.Is<string[]>(s => s.Length == 1 && s.First() == segmentPair.SourceSegment),
                Arg.Is<string[]>(s => s.Length == 1 && s.First() == segmentPair.TargetSegment),
                segmentPair.SentenceStart
            );
    }

    [Test]
    public async Task TrainSegmentAsync_ServalSuccess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        await env.Service.TrainSegmentAsync(User01, Project01, new SegmentPair(), CancellationToken.None);

        await env.TranslationEnginesClient
            .Received(1)
            .TrainSegmentAsync(TranslationEngine01, Arg.Any<SegmentPair>(), CancellationToken.None);
    }

    [Test]
    public async Task TrainSegmentAsync_ExecutesApiAndInProcess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var segmentPair = new SegmentPair
        {
            SentenceStart = false,
            SourceSegment = Segment,
            TargetSegment = TargetSegment,
        };

        // SUT
        await env.Service.TrainSegmentAsync(User01, Project01, segmentPair, CancellationToken.None);

        await env.EngineService
            .Received(1)
            .TrainSegmentAsync(
                TranslationEngine01,
                Arg.Is<string[]>(s => s.Length == 1 && s.First() == segmentPair.SourceSegment),
                Arg.Is<string[]>(s => s.Length == 1 && s.First() == segmentPair.TargetSegment),
                segmentPair.SentenceStart
            );
        await env.TranslationEnginesClient
            .Received(1)
            .TrainSegmentAsync(TranslationEngine01, Arg.Any<SegmentPair>(), CancellationToken.None);
    }

    [Test]
    public void TranslateAsync_NoFeatureFlagsEnabled()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.TranslateAsync(User01, Project01, Segment, CancellationToken.None)
        );
    }

    [Test]
    public void TranslateAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(
            () => env.Service.TranslateAsync("invalid_user_id", Project01, Segment, CancellationToken.None)
        );
    }

    [Test]
    public void TranslateAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.TranslateAsync(User01, "invalid_project_id", Segment, CancellationToken.None)
        );
    }

    [Test]
    public void TranslateAsync_InProcessNoEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));
        env.Engines
            .GetByLocatorAsync(EngineLocatorType.Project, Project01, CancellationToken.None)
            .Returns(Task.FromResult<Engine>(null));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.TranslateAsync(User01, Project01, Segment, CancellationToken.None)
        );
    }

    [Test]
    public void TranslateAsync_ServalNoTranslationEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.TranslateAsync(User01, Project03, Segment, CancellationToken.None)
        );
    }

    [Test]
    public void TranslateAsync_ServalOutageNoInProcess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient
            .TranslateAsync(TranslationEngine01, Segment, CancellationToken.None)
            .Throws(new BrokenCircuitException());
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        Assert.ThrowsAsync<BrokenCircuitException>(
            () => env.Service.TranslateAsync(User01, Project01, Segment, CancellationToken.None)
        );
    }

    [Test]
    public async Task TranslateAsync_ServalApiExceptionFailsToInProcess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient
            .TranslateAsync(TranslationEngine01, Segment, CancellationToken.None)
            .Throws(ServalApiExceptions.NoContent);
        env.EngineService
            .TranslateAsync(TranslationEngine01, Arg.Is<string[]>(s => s.Length == 1 && s.First() == Segment))
            .Returns(
                Task.FromResult(
                    new MachineTranslationResult(
                        Array.Empty<string>(),
                        Array.Empty<string>(),
                        Array.Empty<double>(),
                        Array.Empty<TranslationSources>(),
                        new WordAlignmentMatrix(0, 0),
                        Array.Empty<MachinePhrase>()
                    )
                )
            );

        // SUT
        _ = await env.Service.TranslateAsync(User01, Project01, Segment, CancellationToken.None);

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<ServalApiException>());
    }

    [Test]
    public async Task TranslateAsync_ServalOutageFailsToInProcess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient
            .TranslateAsync(TranslationEngine01, Segment, CancellationToken.None)
            .Throws(new BrokenCircuitException());
        env.EngineService
            .TranslateAsync(TranslationEngine01, Arg.Is<string[]>(s => s.Length == 1 && s.First() == Segment))
            .Returns(
                Task.FromResult(
                    new MachineTranslationResult(
                        Array.Empty<string>(),
                        Array.Empty<string>(),
                        Array.Empty<double>(),
                        Array.Empty<TranslationSources>(),
                        new WordAlignmentMatrix(0, 0),
                        Array.Empty<MachinePhrase>()
                    )
                )
            );

        // SUT
        _ = await env.Service.TranslateAsync(User01, Project01, Segment, CancellationToken.None);

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
    }

    [Test]
    public async Task TranslateAsync_InProcessSuccess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.EngineService
            .TranslateAsync(TranslationEngine01, Arg.Is<string[]>(s => s.Length == 1 && s.First() == Segment))
            .Returns(
                Task.FromResult(
                    new MachineTranslationResult(
                        new[] { Segment },
                        new[] { TargetSegment },
                        new[] { 0.0 },
                        new[] { TranslationSources.Smt | TranslationSources.Transfer | TranslationSources.Prefix },
                        new WordAlignmentMatrix(1, 1, new[] { (0, 0) }),
                        new[] { new MachinePhrase(new Range<int>(), 0, 0.0) }
                    )
                )
            );
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));

        // SUT
        TranslationResult actual = await env.Service.TranslateAsync(User01, Project01, Segment, CancellationToken.None);

        Assert.IsNotNull(actual);
        Assert.AreEqual(1, actual.SourceTokens.Count);
        Assert.AreEqual(1, actual.TargetTokens.Count);
        Assert.AreEqual(1, actual.Confidences.Count);
        Assert.AreEqual(1, actual.Sources.Count);
        Assert.AreEqual(3, actual.Sources.First().Count);
        Assert.AreEqual(1, actual.Alignment.Count);
        Assert.AreEqual(1, actual.Phrases.Count);
        Assert.AreEqual(TargetSegment, actual.Translation);
    }

    [Test]
    public async Task TranslateAsync_ServalSuccess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient
            .TranslateAsync(TranslationEngine01, Segment, CancellationToken.None)
            .Returns(
                Task.FromResult(
                    new TranslationResult
                    {
                        Alignment = new[] { new AlignedWordPair() },
                        Confidences = new[] { 0.0 },
                        Phrases = new[] { new Phrase() },
                        Sources = new IList<TranslationSource>[] { new[] { TranslationSource.Primary } },
                        TargetTokens = new[] { TargetSegment },
                        SourceTokens = new[] { Segment },
                        Translation = TargetSegment,
                    }
                )
            );
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        TranslationResult actual = await env.Service.TranslateAsync(User01, Project01, Segment, CancellationToken.None);

        Assert.IsNotNull(actual);
        Assert.AreEqual(1, actual.SourceTokens.Count);
        Assert.AreEqual(1, actual.TargetTokens.Count);
        Assert.AreEqual(1, actual.Confidences.Count);
        Assert.AreEqual(1, actual.Sources.Count);
        Assert.AreEqual(1, actual.Alignment.Count);
        Assert.AreEqual(1, actual.Phrases.Count);
        Assert.AreEqual(TargetSegment, actual.Translation);
    }

    [Test]
    public async Task TranslateAsync_ExecutesApiAndInProcess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient
            .TranslateAsync(TranslationEngine01, Segment, CancellationToken.None)
            .Returns(
                Task.FromResult(
                    new TranslationResult
                    {
                        Alignment = new[] { new AlignedWordPair() },
                        Confidences = new[] { 0.0 },
                        Phrases = new[] { new Phrase() },
                        Sources = new IList<TranslationSource>[] { new[] { TranslationSource.Primary } },
                        TargetTokens = new[] { TargetSegment },
                        SourceTokens = new[] { Segment },
                        Translation = TargetSegment,
                    }
                )
            );
        env.EngineService
            .TranslateAsync(TranslationEngine01, Arg.Is<string[]>(s => s.Length == 1 && s.First() == Segment))
            .Returns(
                Task.FromResult(
                    new MachineTranslationResult(
                        Array.Empty<string>(),
                        Array.Empty<string>(),
                        Array.Empty<double>(),
                        Array.Empty<TranslationSources>(),
                        new WordAlignmentMatrix(0, 0),
                        Array.Empty<MachinePhrase>()
                    )
                )
            );

        // SUT
        _ = await env.Service.TranslateAsync(User01, Project01, Segment, CancellationToken.None);

        await env.EngineService
            .Received(1)
            .TranslateAsync(TranslationEngine01, Arg.Is<string[]>(s => s.Length == 1 && s.First() == Segment));
        await env.TranslationEnginesClient
            .Received(1)
            .TranslateAsync(TranslationEngine01, Segment, CancellationToken.None);
    }

    [Test]
    public void TranslateNAsync_NoPermission()
    {
        // Set up test environment
        const int n = 1;
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(
            () => env.Service.TranslateNAsync("invalid_user_id", Project01, n, Segment, CancellationToken.None)
        );
    }

    [Test]
    public void TranslateNAsync_NoProject()
    {
        // Set up test environment
        const int n = 1;
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.TranslateNAsync(User01, "invalid_project_id", n, Segment, CancellationToken.None)
        );
    }

    [Test]
    public void TranslateNAsync_InProcessNoEngine()
    {
        // Set up test environment
        const int n = 1;
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));
        env.Engines
            .GetByLocatorAsync(EngineLocatorType.Project, Project01, CancellationToken.None)
            .Returns(Task.FromResult<Engine>(null));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.TranslateNAsync(User01, Project01, n, Segment, CancellationToken.None)
        );
    }

    [Test]
    public void TranslateNAsync_ServalNoTranslationEngine()
    {
        // Set up test environment
        const int n = 1;
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.TranslateNAsync(User01, Project03, n, Segment, CancellationToken.None)
        );
    }

    [Test]
    public void TranslateNAsync_ServalOutageNoInProcess()
    {
        // Set up test environment
        const int n = 1;
        var env = new TestEnvironment();
        env.TranslationEnginesClient
            .TranslateNAsync(TranslationEngine01, n, Segment, CancellationToken.None)
            .Throws(new BrokenCircuitException());
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        Assert.ThrowsAsync<BrokenCircuitException>(
            () => env.Service.TranslateNAsync(User01, Project01, n, Segment, CancellationToken.None)
        );
    }

    [Test]
    public async Task TranslateNAsync_ServalApiExceptionFailsToInProcess()
    {
        // Set up test environment
        const int n = 1;
        var env = new TestEnvironment();
        env.TranslationEnginesClient
            .TranslateNAsync(TranslationEngine01, n, Segment, CancellationToken.None)
            .Throws(ServalApiExceptions.NotSupported);
        env.EngineService
            .TranslateAsync(TranslationEngine01, n, Arg.Is<string[]>(s => s.Length == 1 && s.First() == Segment))
            .Returns(Task.FromResult(Array.Empty<MachineTranslationResult>().AsEnumerable()));

        // SUT
        _ = await env.Service.TranslateNAsync(User01, Project01, n, Segment, CancellationToken.None);

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<ServalApiException>());
    }

    [Test]
    public async Task TranslateNAsync_ServalOutageFailsToInProcess()
    {
        // Set up test environment
        const int n = 1;
        var env = new TestEnvironment();
        env.TranslationEnginesClient
            .TranslateNAsync(TranslationEngine01, n, Segment, CancellationToken.None)
            .Throws(new BrokenCircuitException());
        env.EngineService
            .TranslateAsync(TranslationEngine01, n, Arg.Is<string[]>(s => s.Length == 1 && s.First() == Segment))
            .Returns(Task.FromResult(Array.Empty<MachineTranslationResult>().AsEnumerable()));

        // SUT
        _ = await env.Service.TranslateNAsync(User01, Project01, n, Segment, CancellationToken.None);

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
    }

    [Test]
    public async Task TranslateNAsync_InProcessSuccess()
    {
        // Set up test environment
        const int n = 1;
        var env = new TestEnvironment();
        env.EngineService
            .TranslateAsync(TranslationEngine01, n, Arg.Is<string[]>(s => s.Length == 1 && s.First() == Segment))
            .Returns(
                Task.FromResult(
                    new[]
                    {
                        new MachineTranslationResult(
                            new[] { Segment },
                            new[] { TargetSegment },
                            new[] { 0.0 },
                            new[] { TranslationSources.Smt },
                            new WordAlignmentMatrix(1, 1, new[] { (0, 0) }),
                            new[] { new MachinePhrase(new Range<int>(), 0, 0.0) }
                        ),
                    }.AsEnumerable()
                )
            );
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));

        // SUT
        TranslationResult[] actual = await env.Service.TranslateNAsync(
            User01,
            Project01,
            n,
            Segment,
            CancellationToken.None
        );

        Assert.IsNotNull(actual);
        Assert.AreEqual(1, actual.Length);
        Assert.AreEqual(1, actual.First().SourceTokens.Count);
        Assert.AreEqual(1, actual.First().TargetTokens.Count);
        Assert.AreEqual(1, actual.First().Confidences.Count);
        Assert.AreEqual(1, actual.First().Sources.Count);
        Assert.AreEqual(1, actual.First().Alignment.Count);
        Assert.AreEqual(1, actual.First().Phrases.Count);
        Assert.AreEqual(TargetSegment, actual.First().Translation);
    }

    [Test]
    public async Task TranslateNAsync_ServalSuccess()
    {
        // Set up test environment
        const int n = 1;
        var env = new TestEnvironment();
        env.TranslationEnginesClient
            .TranslateNAsync(TranslationEngine01, n, Segment, CancellationToken.None)
            .Returns(
                Task.FromResult<IList<TranslationResult>>(
                    new[]
                    {
                        new TranslationResult
                        {
                            Alignment = new[] { new AlignedWordPair() },
                            Confidences = new[] { 0.0 },
                            Phrases = new[] { new Phrase() },
                            Sources = new IList<TranslationSource>[] { new[] { TranslationSource.Primary } },
                            TargetTokens = new[] { TargetSegment },
                            SourceTokens = new[] { Segment },
                            Translation = TargetSegment,
                        },
                    }
                )
            );
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        TranslationResult[] actual = await env.Service.TranslateNAsync(
            User01,
            Project01,
            n,
            Segment,
            CancellationToken.None
        );

        Assert.IsNotNull(actual);
        Assert.AreEqual(1, actual.Length);
        Assert.AreEqual(1, actual.First().SourceTokens.Count);
        Assert.AreEqual(1, actual.First().TargetTokens.Count);
        Assert.AreEqual(1, actual.First().Confidences.Count);
        Assert.AreEqual(1, actual.First().Sources.Count);
        Assert.AreEqual(1, actual.First().Alignment.Count);
        Assert.AreEqual(1, actual.First().Phrases.Count);
        Assert.AreEqual(TargetSegment, actual.First().Translation);
    }

    [Test]
    public async Task TranslateNAsync_ExecutesApiAndInProcess()
    {
        // Set up test environment
        const int n = 1;
        var env = new TestEnvironment();
        env.EngineService
            .TranslateAsync(TranslationEngine01, n, Arg.Is<string[]>(s => s.Length == 1 && s.First() == Segment))
            .Returns(Task.FromResult(Array.Empty<MachineTranslationResult>().AsEnumerable()));

        // SUT
        _ = await env.Service.TranslateNAsync(User01, Project01, n, Segment, CancellationToken.None);

        await env.EngineService
            .Received(1)
            .TranslateAsync(TranslationEngine01, n, Arg.Is<string[]>(s => s.Length == 1 && s.First() == Segment));
        await env.TranslationEnginesClient
            .Received(1)
            .TranslateNAsync(TranslationEngine01, n, Segment, CancellationToken.None);
    }

    private class TestEnvironment
    {
        public TestEnvironment()
        {
            BackgroundJobClient = Substitute.For<IBackgroundJobClient>();
            BackgroundJobClient.Create(Arg.Any<Job>(), Arg.Any<IState>()).Returns(JobId);
            Builds = Substitute.For<IBuildRepository>();
            Engines = Substitute.For<IEngineRepository>();
            Engines
                .GetByLocatorAsync(EngineLocatorType.Project, Project01, CancellationToken.None)
                .Returns(
                    Task.FromResult(
                        new Engine
                        {
                            Confidence = 100,
                            Id = TranslationEngine01,
                            SourceLanguageTag = "en_US",
                            TrainedSegmentCount = 472,
                            TargetLanguageTag = "en_NZ",
                        }
                    )
                );
            IOptions<EngineOptions> engineOptions = Options.Create(new EngineOptions());
            EngineService = Substitute.For<IEngineService>();
            ExceptionHandler = Substitute.For<IExceptionHandler>();
            FeatureManager = Substitute.For<IFeatureManager>();
            FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(true));
            FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(true));

            MachineProjectService = Substitute.For<IMachineProjectService>();
            MachineProjectService
                .TranslationEngineExistsAsync(
                    Project01,
                    TranslationEngine01,
                    preTranslate: false,
                    CancellationToken.None
                )
                .Returns(Task.FromResult(true));
            PreTranslationService = Substitute.For<IPreTranslationService>();
            ProjectSecrets = new MemoryRepository<SFProjectSecret>(
                new[]
                {
                    new SFProjectSecret
                    {
                        Id = Project01,
                        ServalData = new ServalData
                        {
                            TranslationEngineId = TranslationEngine01,
                            PreTranslationEngineId = TranslationEngine01,
                        },
                    },
                    new SFProjectSecret
                    {
                        Id = Project02,
                        ServalData = new ServalData { PreTranslationEngineId = TranslationEngine01, },
                    },
                }
            );
            Projects = new MemoryRepository<SFProject>(
                new[]
                {
                    new SFProject
                    {
                        Id = Project01,
                        UserRoles = new Dictionary<string, string> { { User01, SFProjectRole.Administrator } },
                    },
                    new SFProject
                    {
                        Id = Project02,
                        TranslateConfig = new TranslateConfig
                        {
                            DraftConfig = new DraftConfig
                            {
                                AlternateSource = new TranslateSource { ProjectRef = Project03 },
                            },
                        },
                        UserRoles = new Dictionary<string, string> { { User01, SFProjectRole.Administrator } },
                    },
                    new SFProject
                    {
                        Id = Project03,
                        UserRoles = new Dictionary<string, string> { { User01, SFProjectRole.Translator } },
                    },
                }
            );
            var realtimeService = new SFMemoryRealtimeService();
            realtimeService.AddRepository("sf_projects", OTType.Json0, Projects);

            SyncService = Substitute.For<ISyncService>();
            SyncService.SyncAsync(Arg.Any<SyncConfig>()).Returns(Task.FromResult("jobId"));
            TranslationEnginesClient = Substitute.For<ITranslationEnginesClient>();

            Service = new MachineApiService(
                BackgroundJobClient,
                Builds,
                Engines,
                engineOptions,
                EngineService,
                ExceptionHandler,
                FeatureManager,
                MachineProjectService,
                PreTranslationService,
                ProjectSecrets,
                realtimeService,
                SyncService,
                TranslationEnginesClient
            );
        }

        public IBackgroundJobClient BackgroundJobClient { get; }
        public IBuildRepository Builds { get; }
        public IEngineRepository Engines { get; }
        public IEngineService EngineService { get; }
        public IExceptionHandler ExceptionHandler { get; }
        public IFeatureManager FeatureManager { get; }
        public IMachineProjectService MachineProjectService { get; }
        public IPreTranslationService PreTranslationService { get; }
        public MemoryRepository<SFProject> Projects { get; }
        public MemoryRepository<SFProjectSecret> ProjectSecrets { get; }
        public MachineApiService Service { get; }
        public ISyncService SyncService { get; }
        public ITranslationEnginesClient TranslationEnginesClient { get; }

        public async Task QueuePreTranslationBuildAsync(DateTime? dateTime = null, string? errorMessage = null) =>
            await ProjectSecrets.UpdateAsync(
                Project01,
                u =>
                {
                    u.Set(p => p.ServalData.PreTranslationJobId, JobId);
                    u.Set(p => p.ServalData.PreTranslationQueuedAt, dateTime ?? DateTime.UtcNow);
                    if (string.IsNullOrWhiteSpace(errorMessage))
                    {
                        u.Unset(p => p.ServalData.PreTranslationErrorMessage);
                    }
                    else
                    {
                        u.Set(p => p.ServalData.PreTranslationErrorMessage, errorMessage);
                    }
                }
            );
    }
}
