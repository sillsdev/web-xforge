using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Hangfire;
using Hangfire.Common;
using Hangfire.States;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Newtonsoft.Json.Linq;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using NUnit.Framework;
using Polly.CircuitBreaker;
using Serval.Client;
using SIL.XForge.DataAccess;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.RichText;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Realtime;
using SIL.XForge.Services;
using ServalOptions = SIL.XForge.Configuration.ServalOptions;

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
    private const string User02 = "user02";
    private const string Segment = "segment";
    private const string TargetSegment = "targetSegment";
    private const string JobId = "jobId";
    private const string Data01 = "data01";

    private const string JsonPayload =
        """{"event":"TranslationBuildFinished","payload":{"build":{"id":"65f0c455682bb17bc4066917","url":"/api/v1/translation/engines/translationEngine01/builds/65f0c455682bb17bc4066917"},"engine":{"id":"translationEngine01","url":"/api/v1/translation/engines/translationEngine01"},"buildState":"Completed","dateFinished":"2024-03-12T21:14:10.789Z"}}""";

    [Test]
    public void CancelPreTranslationBuildAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(
            () => env.Service.CancelPreTranslationBuildAsync(User02, Project01, CancellationToken.None)
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
    public void CancelPreTranslationBuildAsync_NotSupported()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient.CancelBuildAsync(TranslationEngine01, CancellationToken.None)
            .Throws(ServalApiExceptions.NotSupported);

        // SUT
        Assert.ThrowsAsync<NotSupportedException>(
            () => env.Service.CancelPreTranslationBuildAsync(User01, Project01, CancellationToken.None)
        );
    }

    [Test]
    public void CancelPreTranslationBuildAsync_NoTranslationEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.CancelPreTranslationBuildAsync(User01, Project03, CancellationToken.None)
        );
    }

    [Test]
    public async Task CancelPreTranslationBuildAsync_NoTranslationEngineAndJobQueued()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.ProjectSecrets.UpdateAsync(Project01, op => op.Unset(p => p.ServalData.PreTranslationEngineId));
        await env.QueueBuildAsync(preTranslate: true);

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.CancelPreTranslationBuildAsync(User01, Project01, CancellationToken.None)
        );

        env.BackgroundJobClient.Received(1).ChangeState(JobId, Arg.Any<DeletedState>(), null); // Same as Delete()
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.PreTranslationJobId);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.PreTranslationQueuedAt);
    }

    [Test]
    public async Task CancelPreTranslationBuildAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.QueueBuildAsync(preTranslate: true);

        // SUT
        await env.Service.CancelPreTranslationBuildAsync(User01, Project01, CancellationToken.None);

        await env.TranslationEnginesClient.Received(1).CancelBuildAsync(TranslationEngine01, CancellationToken.None);
        env.BackgroundJobClient.Received(1).ChangeState(JobId, Arg.Any<DeletedState>(), null); // Same as Delete()
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.PreTranslationJobId);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.PreTranslationQueuedAt);
    }

    [Test]
    public void ExecuteWebhook_InvalidSignature()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string signature = "sha256=A7B193B79CE717541B3EF2A306FDD441F2CE0DEAA674404F212E35AECC4F3EA3";

        // SUT
        Assert.ThrowsAsync<ArgumentException>(() => env.Service.ExecuteWebhookAsync(JsonPayload, signature));
    }

    [Test]
    public async Task ExecuteWebhook_MissingProjectId()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string json =
            """{"event":"TranslationBuildFinished","payload":{"build":{"id":"65f0c455682bb17bc4066917","url":"/api/v1/translation/engines/65e66c70682bb17bc405e9ce/builds/65f0c455682bb17bc4066917"},"engine":{"id":"65e66c70682bb17bc405e9ce","url":"/api/v1/translation/engines/65e66c70682bb17bc405e9ce"},"buildState":"Completed","dateFinished":"2024-03-12T21:14:10.789Z"}}""";
        const string signature = "sha256=24BBC1C61AEE03CEC0A100478A38FB16AAD7CCFDAC1D9B6170CB6AA2EFF82F81";

        // SUT
        await env.Service.ExecuteWebhookAsync(json, signature);
        env.MockLogger.AssertHasEvent(logEvent => logEvent.LogLevel == LogLevel.Warning);
    }

    [Test]
    public void ExecuteWebhook_MissingTranslationEngineId()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string json =
            """{"event":"TranslationBuildFinished","payload":{"build":{"id":"65f0c455682bb17bc4066917","url":"/api/v1/translation/engines/65e66c70682bb17bc405e9ce/builds/65f0c455682bb17bc4066917"},"buildState":"Completed","dateFinished":"2024-03-12T21:14:10.789Z"}}""";
        const string signature = "sha256=A45F54207BF128799A7EE803B3822A9956A24B41E5134A0E9663E64D3FC9D9A3";

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() => env.Service.ExecuteWebhookAsync(json, signature));
    }

    [Test]
    public async Task ExecuteWebhook_UnsupportedBuildState()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string json =
            """{"event":"TranslationBuildFinished","payload":{"build":{"id":"6668b63edb2383657780f934","url":"/api/v1/translation/engines/6657d17c593d597a09de8503/builds/6668b63edb2383657780f934"},"engine":{"id":"6657d17c593d597a09de8503","url":"/api/v1/translation/engines/6657d17c593d597a09de8503"},"buildState":"Faulted","dateFinished":"2024-06-11T21:47:05.295Z"}}""";
        const string signature = "sha256=6B6D3E071C019D8012677EA9F5F9DA8E3DF9E870BFAFC3F8D2B8CA1B6CF517D7";

        // SUT
        await env.Service.ExecuteWebhookAsync(json, signature);
        env.BackgroundJobClient.DidNotReceive().Create(Arg.Any<Job>(), Arg.Any<IState>());
    }

    [Test]
    public async Task ExecuteWebhook_UnsupportedEvent()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string json =
            """{"event":"TranslationBuildStarted","payload":{"build":{"id":"65d65811352b5d93e8a2c02d","url":"/api/v1/translation/engines/65c94648352b5d93e8a24538/builds/65d65811352b5d93e8a2c02d"},"engine":{"id":"65c94648352b5d93e8a24538","url":"/api/v1/translation/engines/65c94648352b5d93e8a24538"}}}""";
        const string signature = "sha256=27F96A1483806939905686D944B9753AB4C023F6EFB07A9F91E3E1A208DADF32";

        // SUT
        await env.Service.ExecuteWebhookAsync(json, signature);
        env.BackgroundJobClient.DidNotReceive().Create(Arg.Any<Job>(), Arg.Any<IState>());
    }

    [Test]
    public async Task ExecuteWebhook_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string signature = "sha256=8C8E8C11165F748AFC6621F1DB213F79CE52759757D9BD6382C94E92C5B31063";

        // SUT
        await env.Service.ExecuteWebhookAsync(JsonPayload, signature);
        env.BackgroundJobClient.Received().Create(Arg.Any<Job>(), Arg.Any<IState>());
    }

    [Test]
    public void GetBuildAsync_BuildEnded()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const int minRevision = 0;
        env.TranslationEnginesClient.GetBuildAsync(TranslationEngine01, Build01, minRevision, CancellationToken.None)
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
                    isServalAdmin: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public async Task GetBuildAsync_NoBuildRunning()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient.GetBuildAsync(TranslationEngine01, Build01, null, CancellationToken.None)
            .Throws(ServalApiExceptions.TimeOut);

        // SUT
        ServalBuildDto? actual = await env.Service.GetBuildAsync(
            User01,
            Project01,
            Build01,
            minRevision: null,
            preTranslate: false,
            isServalAdmin: false,
            CancellationToken.None
        );

        Assert.IsNull(actual);
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
                    User02,
                    Project01,
                    Build01,
                    minRevision: null,
                    preTranslate: false,
                    isServalAdmin: false,
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
                    isServalAdmin: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public void GetBuildAsync_NoTranslationEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.GetBuildAsync(
                    User01,
                    Project03,
                    Build01,
                    minRevision: null,
                    preTranslate: false,
                    isServalAdmin: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public async Task GetBuildAsync_ServalAdminDoesNotNeedPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient.GetBuildAsync(
                TranslationEngine01,
                Build01,
                minRevision: null,
                CancellationToken.None
            )
            .Returns(Task.FromResult(new TranslationBuild()));

        // SUT
        ServalBuildDto? actual = await env.Service.GetBuildAsync(
            User02,
            Project01,
            Build01,
            minRevision: null,
            preTranslate: true,
            isServalAdmin: true,
            CancellationToken.None
        );

        Assert.IsNotNull(actual);
    }

    [Test]
    public async Task GetBuildAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string buildDtoId = $"{Project01}.{Build01}";
        const string message = "Finalizing";
        const double percentCompleted = 0.95;
        const int revision = 553;
        const JobState state = JobState.Active;
        env.TranslationEnginesClient.GetBuildAsync(
                TranslationEngine01,
                Build01,
                minRevision: null,
                CancellationToken.None
            )
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

        // SUT
        ServalBuildDto? actual = await env.Service.GetBuildAsync(
            User01,
            Project01,
            Build01,
            minRevision: null,
            preTranslate: false,
            isServalAdmin: false,
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
        Assert.NotNull(actual.AdditionalInfo);
    }

    [Test]
    public async Task GetBuildAsync_IncludesAdditionalInfo()
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
        env.TranslationEnginesClient.GetBuildAsync(
                TranslationEngine01,
                Build01,
                minRevision: null,
                CancellationToken.None
            )
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
                        Pretranslate =
                        [
                            new PretranslateCorpus
                            {
                                Corpus = new ResourceLink { Id = corpusId1, Url = "https://example.com" },
                            },
                            new PretranslateCorpus
                            {
                                Corpus = new ResourceLink { Id = corpusId2, Url = "https://example.com" },
                            },
                        ],
                    }
                )
            );

        // SUT
        ServalBuildDto? actual = await env.Service.GetBuildAsync(
            User01,
            Project01,
            Build01,
            minRevision: null,
            preTranslate: false,
            isServalAdmin: false,
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
    public void GetCurrentBuildAsync_BuildEnded()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const int minRevision = 0;
        env.TranslationEnginesClient.GetCurrentBuildAsync(TranslationEngine01, minRevision, CancellationToken.None)
            .Throws(ServalApiExceptions.NoContent);

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.GetCurrentBuildAsync(
                    User01,
                    Project01,
                    minRevision,
                    preTranslate: false,
                    isServalAdmin: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public async Task GetCurrentBuildAsync_NoBuildRunning()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient.GetCurrentBuildAsync(TranslationEngine01, null, CancellationToken.None)
            .Throws(ServalApiExceptions.TimeOut);

        // SUT
        ServalBuildDto? actual = await env.Service.GetCurrentBuildAsync(
            User01,
            Project01,
            minRevision: null,
            preTranslate: false,
            isServalAdmin: false,
            CancellationToken.None
        );

        Assert.IsNull(actual);
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
                    User02,
                    Project01,
                    minRevision: null,
                    preTranslate: false,
                    isServalAdmin: false,
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
                    isServalAdmin: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public void GetCurrentBuildAsync_NoTranslationEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.GetCurrentBuildAsync(
                    User01,
                    Project03,
                    minRevision: null,
                    preTranslate: false,
                    isServalAdmin: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public async Task GetCurrentBuildAsync_ServalAdminDoesNotNeedPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient.GetCurrentBuildAsync(
                TranslationEngine01,
                minRevision: null,
                CancellationToken.None
            )
            .Returns(Task.FromResult(new TranslationBuild()));

        // SUT
        ServalBuildDto? actual = await env.Service.GetCurrentBuildAsync(
            User02,
            Project01,
            minRevision: null,
            preTranslate: true,
            isServalAdmin: true,
            CancellationToken.None
        );

        Assert.IsNotNull(actual);
    }

    [Test]
    public async Task GetCurrentBuildAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string buildDtoId = $"{Project01}.{Build01}";
        const string message = "Finalizing";
        const double percentCompleted = 0.95;
        const int revision = 553;
        const JobState state = JobState.Active;
        env.TranslationEnginesClient.GetCurrentBuildAsync(
                TranslationEngine01,
                minRevision: null,
                CancellationToken.None
            )
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

        // SUT
        ServalBuildDto? actual = await env.Service.GetCurrentBuildAsync(
            User01,
            Project01,
            minRevision: null,
            preTranslate: false,
            isServalAdmin: false,
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
    public async Task GetCurrentBuildAsync_PreTranslationCompleted()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string buildDtoId = $"{Project01}.{Build01}";
        const string message = "Completed";
        const double percentCompleted = 0;
        const int revision = 43;
        const JobState state = JobState.Completed;
        env.TranslationEnginesClient.GetCurrentBuildAsync(
                TranslationEngine01,
                minRevision: null,
                CancellationToken.None
            )
            .Throws(ServalApiExceptions.NoContent);
        env.TranslationEnginesClient.GetAllBuildsAsync(TranslationEngine01, CancellationToken.None)
            .Returns(
                Task.FromResult<IList<TranslationBuild>>(
                    [
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
                    ]
                )
            );

        // SUT
        ServalBuildDto? actual = await env.Service.GetCurrentBuildAsync(
            User01,
            Project01,
            minRevision: null,
            preTranslate: true,
            isServalAdmin: false,
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
    public void GetCurrentBuildAsync_PreTranslationNoBuilds()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient.GetCurrentBuildAsync(
                TranslationEngine01,
                minRevision: null,
                CancellationToken.None
            )
            .Throws(ServalApiExceptions.NoContent);
        env.TranslationEnginesClient.GetAllBuildsAsync(TranslationEngine01, CancellationToken.None)
            .Returns(Task.FromResult<IList<TranslationBuild>>([]));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.GetCurrentBuildAsync(
                    User01,
                    Project01,
                    minRevision: null,
                    preTranslate: true,
                    isServalAdmin: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public void GetEngineAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(
            () => env.Service.GetEngineAsync(User02, Project01, CancellationToken.None)
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
    public void GetEngineAsync_DoesNotOwnTranslationEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient.GetAsync(TranslationEngine01, CancellationToken.None)
            .Throws(ServalApiExceptions.Forbidden);

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(
            () => env.Service.GetEngineAsync(User01, Project01, CancellationToken.None)
        );
    }

    [Test]
    public void GetEngineAsync_NoTranslationEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.GetEngineAsync(User01, Project03, CancellationToken.None)
        );
    }

    [Test]
    public void GetEngineAsync_ServalOutage()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient.GetAsync(TranslationEngine01, CancellationToken.None)
            .Throws(new BrokenCircuitException());

        // SUT
        Assert.ThrowsAsync<BrokenCircuitException>(
            () => env.Service.GetEngineAsync(User01, Project01, CancellationToken.None)
        );
    }

    [Test]
    public async Task GetEngineAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string sourceLanguageTag = "en_US";
        const string targetLanguageTag = "en_NZ";
        const double confidence = 96.0;
        const int corpusSize = 472;
        env.TranslationEnginesClient.GetAsync(TranslationEngine01, CancellationToken.None)
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

        // SUT
        ServalEngineDto actual = await env.Service.GetEngineAsync(User01, Project01, CancellationToken.None);

        Assert.AreEqual(confidence / 100.0, actual.Confidence);
        Assert.AreEqual(corpusSize, actual.TrainedSegmentCount);
        Assert.AreEqual(sourceLanguageTag, actual.SourceLanguageTag);
        Assert.AreEqual(targetLanguageTag, actual.TargetLanguageTag);
        Assert.AreEqual(MachineApi.GetEngineHref(Project01), actual.Href);
        Assert.AreEqual(1, actual.Projects.Length);
        Assert.AreEqual(Project01, actual.Projects.First().Id);
        Assert.AreEqual(MachineApi.GetEngineHref(Project01), actual.Projects.First().Href);
    }

    [Test]
    public async Task GetLastCompletedPreTranslationBuildAsync_NoCompletedBuild()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient.GetAllBuildsAsync(TranslationEngine01, CancellationToken.None)
            .Returns(
                Task.FromResult<IList<TranslationBuild>>(
                    [
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
                    ]
                )
            );

        // SUT
        ServalBuildDto? actual = await env.Service.GetLastCompletedPreTranslationBuildAsync(
            User01,
            Project01,
            false,
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
            () => env.Service.GetLastCompletedPreTranslationBuildAsync(User02, Project01, false, CancellationToken.None)
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
                    false,
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
            () => env.Service.GetLastCompletedPreTranslationBuildAsync(User01, Project03, false, CancellationToken.None)
        );
    }

    [Test]
    public void GetLastCompletedPreTranslationBuildAsync_ServalOutage()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient.GetAllBuildsAsync(TranslationEngine01).Throws(new BrokenCircuitException());

        // SUT
        Assert.ThrowsAsync<BrokenCircuitException>(
            () => env.Service.GetLastCompletedPreTranslationBuildAsync(User01, Project01, false, CancellationToken.None)
        );
    }

    [Test]
    public async Task GetLastCompletedPreTranslationBuildAsync_ServalAdminDoesNotNeedPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient.GetAllBuildsAsync(TranslationEngine01, CancellationToken.None)
            .Returns(Task.FromResult<IList<TranslationBuild>>([]));

        // SUT
        ServalBuildDto? actual = await env.Service.GetLastCompletedPreTranslationBuildAsync(
            User02,
            Project01,
            true,
            CancellationToken.None
        );

        Assert.IsNull(actual);
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
        env.TranslationEnginesClient.GetAllBuildsAsync(TranslationEngine01, CancellationToken.None)
            .Returns(
                Task.FromResult<IList<TranslationBuild>>(
                    [
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
                    ]
                )
            );

        // SUT
        ServalBuildDto? actual = await env.Service.GetLastCompletedPreTranslationBuildAsync(
            User01,
            Project01,
            false,
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
        env.PreTranslationService.GetPreTranslationsAsync(Project01, 40, 1, CancellationToken.None)
            .Throws(ServalApiExceptions.EngineNotBuilt);

        // SUT
        Assert.ThrowsAsync<InvalidOperationException>(
            () => env.Service.GetPreTranslationAsync(User01, Project01, 40, 1, CancellationToken.None)
        );
    }

    [Test]
    public void GetPreTranslationAsync_InvalidCredentials()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.PreTranslationService.GetPreTranslationsAsync(Project01, 40, 1, CancellationToken.None)
            .Throws(ServalApiExceptions.NotAuthenticated);

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(
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
            () => env.Service.GetPreTranslationAsync(User02, Project01, 40, 1, CancellationToken.None)
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
    public void GetPreTranslationAsync_ServalOutage()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.PreTranslationService.GetPreTranslationsAsync(Project01, 40, 1, CancellationToken.None)
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
        env.PreTranslationService.GetPreTranslationsAsync(Project01, 40, 1, CancellationToken.None)
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
    public void GetPreTranslationDeltaAsync_CorpusDoesNotSupportUsfm()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.PreTranslationService.GetPreTranslationUsfmAsync(Project01, 40, 1, CancellationToken.None)
            .Throws(ServalApiExceptions.InvalidCorpus);

        // SUT
        Assert.ThrowsAsync<NotSupportedException>(
            () => env.Service.GetPreTranslationDeltaAsync(User01, Project01, 40, 1, CancellationToken.None)
        );
    }

    [Test]
    public void GetPreTranslationDeltaAsync_ChapterNotSpecified()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.GetPreTranslationDeltaAsync(User01, Project01, 40, 0, CancellationToken.None)
        );
    }

    [Test]
    public async Task GetPreTranslationDeltaAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        JToken token = JToken.Parse("{\"insert\": { \"chapter\": { \"number\": \"1\", \"style\": \"c\" } } }");
        Delta expected = new Delta([token]);
        env.ParatextService.GetDeltaFromUsfmAsync(User01, Project01, Arg.Any<string>(), 40)
            .Returns(Task.FromResult(expected));

        // SUT
        Snapshot<TextData> actual = await env.Service.GetPreTranslationDeltaAsync(
            User01,
            Project01,
            40,
            1,
            CancellationToken.None
        );
        Assert.AreEqual(expected.Ops[0], actual.Data.Ops[0]);
        Assert.AreEqual($"{Project01}:MAT:1:target", actual.Id);
    }

    [Test]
    public void GetPreTranslationUsfmAsync_CorpusDoesNotSupportUsfm()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.PreTranslationService.GetPreTranslationUsfmAsync(Project01, 40, 1, CancellationToken.None)
            .Throws(ServalApiExceptions.InvalidCorpus);

        // SUT
        Assert.ThrowsAsync<NotSupportedException>(
            () => env.Service.GetPreTranslationUsfmAsync(User01, Project01, 40, 1, false, CancellationToken.None)
        );
    }

    [Test]
    public async Task GetPreTranslationUsfmAsync_ServalAdminDoesNotNeedPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string expected = "\\c 1 \\v1 Verse 1";
        env.PreTranslationService.GetPreTranslationUsfmAsync(Project01, 40, 1, CancellationToken.None)
            .Returns(Task.FromResult(expected));

        // SUT
        string usfm = await env.Service.GetPreTranslationUsfmAsync(
            User02,
            Project01,
            40,
            1,
            true,
            CancellationToken.None
        );
        Assert.AreEqual(expected, usfm);
    }

    [Test]
    public async Task GetPreTranslationUsfmAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string expected = "\\c 1 \\v1 Verse 1";
        env.PreTranslationService.GetPreTranslationUsfmAsync(Project01, 40, 1, CancellationToken.None)
            .Returns(Task.FromResult(expected));

        // SUT
        string usfm = await env.Service.GetPreTranslationUsfmAsync(
            User01,
            Project01,
            40,
            1,
            false,
            CancellationToken.None
        );
        Assert.AreEqual(expected, usfm);
    }

    [Test]
    public void GetWordGraphAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(
            () => env.Service.GetWordGraphAsync(User02, Project01, Segment, CancellationToken.None)
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
    public void GetWordGraphAsync_NoTranslationEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.GetWordGraphAsync(User01, Project03, Segment, CancellationToken.None)
        );
    }

    [Test]
    public void GetWordGraphAsync_ServalOutage()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient.GetWordGraphAsync(TranslationEngine01, Segment, CancellationToken.None)
            .Throws(new BrokenCircuitException());

        // SUT
        Assert.ThrowsAsync<BrokenCircuitException>(
            () => env.Service.GetWordGraphAsync(User01, Project01, Segment, CancellationToken.None)
        );
    }

    [Test]
    public async Task GetWordGraphAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const float initialStateScore = -91.43696f;
        env.TranslationEnginesClient.GetWordGraphAsync(TranslationEngine01, Segment, CancellationToken.None)
            .Returns(
                Task.FromResult(
                    new WordGraph
                    {
                        Arcs = [new WordGraphArc()],
                        FinalStates = [1],
                        InitialStateScore = initialStateScore,
                        SourceTokens = [Segment],
                    }
                )
            );

        // SUT
        WordGraph actual = await env.Service.GetWordGraphAsync(User01, Project01, Segment, CancellationToken.None);

        Assert.IsNotNull(actual);
        Assert.AreEqual(initialStateScore, actual.InitialStateScore);
        Assert.AreEqual(1, actual.Arcs.Count);
        Assert.AreEqual(1, actual.FinalStates.Count);
    }

    [Test]
    public void GetWordGraph_EngineNotBuilt()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient.GetWordGraphAsync(TranslationEngine01, Segment)
            .Throws(ServalApiExceptions.EngineNotBuilt);

        // SUT
        Assert.ThrowsAsync<InvalidOperationException>(
            () => env.Service.GetWordGraphAsync(User01, Project01, Segment, CancellationToken.None)
        );
    }

    [Test]
    public async Task GetQueuedStateAsync_BuildCrashed()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string errorMessage = "This is an error message from Serval";
        await env.QueueBuildAsync(preTranslate: false, DateTime.UtcNow.AddHours(-6), errorMessage);

        // SUT
        ServalBuildDto? actual = await env.Service.GetQueuedStateAsync(
            User01,
            Project01,
            preTranslate: false,
            isServalAdmin: false,
            CancellationToken.None
        );
        Assert.AreEqual(MachineApiService.BuildStateFaulted, actual?.State);
        Assert.AreEqual(errorMessage, actual?.Message);
    }

    [Test]
    public async Task GetQueuedStateAsync_BuildRunTooLong()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.QueueBuildAsync(preTranslate: false, DateTime.UtcNow.AddHours(-6));

        // SUT
        ServalBuildDto? actual = await env.Service.GetQueuedStateAsync(
            User01,
            Project01,
            preTranslate: false,
            isServalAdmin: false,
            CancellationToken.None
        );
        Assert.AreEqual(MachineApiService.BuildStateFaulted, actual?.State);
        Assert.IsFalse(string.IsNullOrWhiteSpace(actual?.Message));
    }

    [Test]
    public async Task GetQueuedStateAsync_BuildQueued()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.QueueBuildAsync(preTranslate: false);

        // SUT
        ServalBuildDto? actual = await env.Service.GetQueuedStateAsync(
            User01,
            Project01,
            preTranslate: false,
            isServalAdmin: false,
            CancellationToken.None
        );
        Assert.AreEqual(MachineApiService.BuildStateQueued, actual?.State);
        Assert.AreEqual(Project01, actual?.Id);
    }

    [Test]
    public async Task GetQueuedStateAsync_NoBuildQueued()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        ServalBuildDto? actual = await env.Service.GetQueuedStateAsync(
            User01,
            Project01,
            preTranslate: false,
            isServalAdmin: false,
            CancellationToken.None
        );
        Assert.IsNull(actual);
    }

    [Test]
    public async Task GetQueuedStateAsync_PreTranslationBuildCrashed()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string errorMessage = "This is an error message from Serval";
        await env.QueueBuildAsync(preTranslate: true, DateTime.UtcNow.AddHours(-6), errorMessage);

        // SUT
        ServalBuildDto? actual = await env.Service.GetQueuedStateAsync(
            User01,
            Project01,
            preTranslate: true,
            isServalAdmin: false,
            CancellationToken.None
        );
        Assert.AreEqual(MachineApiService.BuildStateFaulted, actual?.State);
        Assert.AreEqual(errorMessage, actual?.Message);
    }

    [Test]
    public async Task GetQueuedStateAsync_PreTranslationBuildRunTooLong()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.QueueBuildAsync(preTranslate: true, DateTime.UtcNow.AddHours(-6));

        // SUT
        ServalBuildDto? actual = await env.Service.GetQueuedStateAsync(
            User01,
            Project01,
            preTranslate: true,
            isServalAdmin: false,
            CancellationToken.None
        );
        Assert.AreEqual(MachineApiService.BuildStateFaulted, actual?.State);
        Assert.IsFalse(string.IsNullOrWhiteSpace(actual?.Message));
    }

    [Test]
    public async Task GetQueuedStateAsync_PreTranslationBuildQueued()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.QueueBuildAsync(preTranslate: true);

        // SUT
        ServalBuildDto? actual = await env.Service.GetQueuedStateAsync(
            User01,
            Project01,
            preTranslate: true,
            isServalAdmin: false,
            CancellationToken.None
        );
        Assert.AreEqual(MachineApiService.BuildStateQueued, actual?.State);
    }

    [Test]
    public async Task GetQueuedStateAsync_NoPreTranslationBuildQueued()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        ServalBuildDto? actual = await env.Service.GetQueuedStateAsync(
            User01,
            Project01,
            preTranslate: true,
            isServalAdmin: false,
            CancellationToken.None
        );
        Assert.IsNull(actual);
    }

    [Test]
    public void GetQueuedStateAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(
            () =>
                env.Service.GetQueuedStateAsync(
                    User02,
                    Project01,
                    preTranslate: true,
                    isServalAdmin: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public async Task GetQueuedStateAsync_ServalAdminDoesNotNeedPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        ServalBuildDto? actual = await env.Service.GetQueuedStateAsync(
            User02,
            Project01,
            preTranslate: true,
            isServalAdmin: true,
            CancellationToken.None
        );
        Assert.IsNull(actual);
    }

    [Test]
    public async Task RetrievePreTranslationStatusAsync_DoesNotRecordTaskCancellation()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.PreTranslationService.UpdatePreTranslationStatusAsync(Project01, CancellationToken.None)
            .Throws(new TaskCanceledException());

        // SUT
        await env.Service.RetrievePreTranslationStatusAsync(Project01, CancellationToken.None);

        env.ExceptionHandler.DidNotReceive().ReportException(Arg.Any<Exception>());
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.PreTranslationsRetrieved);
    }

    [Test]
    public async Task RetrievePreTranslationStatusAsync_DoesNotUpdateIfAlreadyRunning()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.ProjectSecrets.UpdateAsync(Project01, u => u.Set(p => p.ServalData.PreTranslationsRetrieved, false));

        // SUT
        await env.Service.RetrievePreTranslationStatusAsync(Project01, CancellationToken.None);

        await env
            .PreTranslationService.DidNotReceive()
            .UpdatePreTranslationStatusAsync(Project01, CancellationToken.None);
    }

    [Test]
    public async Task RetrievePreTranslationStatusAsync_ReportsErrors()
    {
        // Set up test environment
        var env = new TestEnvironment();
        ServalApiException ex = ServalApiExceptions.Forbidden;
        env.PreTranslationService.UpdatePreTranslationStatusAsync(Project01, CancellationToken.None).Throws(ex);

        // SUT
        await env.Service.RetrievePreTranslationStatusAsync(Project01, CancellationToken.None);

        env.MockLogger.AssertHasEvent(logEvent => logEvent.Exception == ex);
        env.ExceptionHandler.Received().ReportException(ex);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.PreTranslationsRetrieved);
    }

    [Test]
    public async Task RetrievePreTranslationStatusAsync_ReportsErrorWhenProjectDoesNotExist()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        await env.Service.RetrievePreTranslationStatusAsync("invalid_project_id", CancellationToken.None);

        env.ExceptionHandler.Received().ReportException(Arg.Any<Exception>());
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.PreTranslationsRetrieved);
    }

    [Test]
    public async Task RetrievePreTranslationStatusAsync_UpdatesPreTranslationStatus()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        await env.Service.RetrievePreTranslationStatusAsync(Project01, CancellationToken.None);

        await env.PreTranslationService.Received().UpdatePreTranslationStatusAsync(Project01, CancellationToken.None);
    }

    [Test]
    public async Task RetrievePreTranslationStatusAsync_UpdatesPreTranslationStatusIfPreviouslyRun()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.ProjectSecrets.UpdateAsync(Project01, u => u.Set(p => p.ServalData.PreTranslationsRetrieved, true));

        // SUT
        await env.Service.RetrievePreTranslationStatusAsync(Project01, CancellationToken.None);

        await env.PreTranslationService.Received().UpdatePreTranslationStatusAsync(Project01, CancellationToken.None);
    }

    [Test]
    public async Task IsLanguageSupportedAsync_LanguageNotSupported()
    {
        // Set up test environment
        const string languageCode = "123";
        var env = new TestEnvironment();
        env.TranslationEngineTypesClient.GetLanguageInfoAsync(MachineProjectService.Nmt, languageCode)
            .Returns(Task.FromResult(new LanguageInfo { EngineType = MachineProjectService.Nmt, IsNative = false }));

        // SUT
        LanguageDto actual = await env.Service.IsLanguageSupportedAsync(languageCode, CancellationToken.None);
        Assert.AreEqual(languageCode, actual.LanguageCode);
        Assert.IsFalse(actual.IsSupported);
    }

    [Test]
    public async Task IsLanguageSupportedAsync_LanguageSupported()
    {
        // Set up test environment
        const string languageCode = "cmn";
        const string internalCode = "zho_Hans";
        var env = new TestEnvironment();
        env.TranslationEngineTypesClient.GetLanguageInfoAsync(MachineProjectService.Nmt, languageCode)
            .Returns(
                Task.FromResult(
                    new LanguageInfo
                    {
                        EngineType = MachineProjectService.Nmt,
                        InternalCode = internalCode,
                        IsNative = true
                    }
                )
            );

        // SUT
        LanguageDto actual = await env.Service.IsLanguageSupportedAsync(languageCode, CancellationToken.None);
        Assert.AreEqual(internalCode, actual.LanguageCode);
        Assert.IsTrue(actual.IsSupported);
    }

    [Test]
    public void StartBuildAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(
            () => env.Service.StartBuildAsync(User02, Project01, CancellationToken.None)
        );
    }

    [Test]
    public void StartBuildAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.StartBuildAsync(User01, "invalid_project_id", CancellationToken.None)
        );
    }

    [Test]
    public async Task StartBuildAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        await env.Service.StartBuildAsync(User01, Project01, CancellationToken.None);

        await env.ProjectService.Received(1).SyncAsync(User01, Project01);
        env.BackgroundJobClient.Received(1).Create(Arg.Any<Job>(), Arg.Any<IState>());
        Assert.AreEqual(JobId, env.ProjectSecrets.Get(Project01).ServalData!.TranslationJobId);
        Assert.IsNotNull(env.ProjectSecrets.Get(Project01).ServalData?.TranslationQueuedAt);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData?.TranslationErrorMessage);
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

        await env
            .SyncService.Received(1)
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
                        AlternateSourceEnabled = true,
                        AlternateSource = new TranslateSource { ProjectRef = Project03 },
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

        await env
            .SyncService.Received(1)
            .SyncAsync(Arg.Is<SyncConfig>(s => s.ProjectId == Project03 && s.TargetOnly && s.UserId == User01));
        await env
            .SyncService.Received(1)
            .SyncAsync(Arg.Is<SyncConfig>(s => s.ProjectId == Project01 && s.TargetOnly && s.UserId == User01));
        env.BackgroundJobClient.Received(1).Create(Arg.Any<Job>(), Arg.Any<IState>());
        Assert.AreEqual(JobId, env.ProjectSecrets.Get(Project02).ServalData!.PreTranslationJobId);
        Assert.IsNotNull(env.ProjectSecrets.Get(Project02).ServalData?.PreTranslationQueuedAt);
        Assert.IsNull(env.ProjectSecrets.Get(Project02).ServalData?.PreTranslationErrorMessage);
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
                    User02,
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
    public void StartPreTranslationBuildAsync_DoNotAllowTrainingScriptureRangeWithTrainingBooks()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.StartPreTranslationBuildAsync(
                    User01,
                    new BuildConfig
                    {
                        ProjectId = Project01,
                        TrainingScriptureRange = "GEN",
                        TrainingBooks = [1],
                    },
                    CancellationToken.None
                )
        );
    }

    [Test]
    public void StartPreTranslationBuildAsync_DoNotAllowTranslationScriptureRangeWithTranslationBooks()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.StartPreTranslationBuildAsync(
                    User01,
                    new BuildConfig
                    {
                        ProjectId = Project01,
                        TranslationScriptureRange = "GEN",
                        TranslationBooks = [1],
                    },
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

        await env.ProjectService.Received(1).SyncAsync(User01, Project01);
        env.BackgroundJobClient.Received(1).Create(Arg.Any<Job>(), Arg.Any<IState>());
        Assert.AreEqual(JobId, env.ProjectSecrets.Get(Project01).ServalData!.PreTranslationJobId);
        Assert.IsNotNull(env.ProjectSecrets.Get(Project01).ServalData?.PreTranslationQueuedAt);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData?.PreTranslationErrorMessage);
        Assert.IsEmpty(env.Projects.Get(Project01).TranslateConfig.DraftConfig.LastSelectedTrainingBooks);
        Assert.IsEmpty(env.Projects.Get(Project01).TranslateConfig.DraftConfig.LastSelectedTrainingDataFiles);
        Assert.IsEmpty(env.Projects.Get(Project01).TranslateConfig.DraftConfig.LastSelectedTranslationBooks);
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

        await env.ProjectService.Received(1).SyncAsync(User01, Project01);
        env.BackgroundJobClient.Received(1).Create(Arg.Any<Job>(), Arg.Any<IState>());
        Assert.AreEqual(JobId, env.ProjectSecrets.Get(Project01).ServalData!.PreTranslationJobId);
        Assert.IsNotNull(env.ProjectSecrets.Get(Project01).ServalData?.PreTranslationQueuedAt);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData?.PreTranslationErrorMessage);
        SFProject project = env.Projects.Get(Project01);
        Assert.IsTrue(project.TranslateConfig.PreTranslate);
        Assert.AreEqual(0, project.TranslateConfig.DraftConfig.LastSelectedTrainingBooks.Count);
        Assert.AreEqual(2, project.TranslateConfig.DraftConfig.LastSelectedTranslationBooks.Count);
        Assert.AreEqual(1, project.TranslateConfig.DraftConfig.LastSelectedTranslationBooks.First());
        Assert.AreEqual(2, project.TranslateConfig.DraftConfig.LastSelectedTranslationBooks.Last());
    }

    [Test]
    public async Task StartPreTranslationBuildAsync_SuccessWithTrainingAndTranslationBooksAndDataFiles()
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
                TranslationBooks = { 3, 4 },
                TrainingDataFiles = { Data01 },
            },
            CancellationToken.None
        );

        await env.ProjectService.Received(1).SyncAsync(User01, Project01);
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
        Assert.AreEqual(1, env.Projects.Get(Project01).TranslateConfig.DraftConfig.LastSelectedTrainingDataFiles.Count);
        Assert.AreEqual(
            Data01,
            env.Projects.Get(Project01).TranslateConfig.DraftConfig.LastSelectedTrainingDataFiles.First()
        );
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

        await env
            .SyncService.Received(1)
            .SyncAsync(Arg.Is<SyncConfig>(s => s.ProjectId == Project01 && s.TargetOnly && s.UserId == User01));
        env.BackgroundJobClient.Received(1).Create(Arg.Any<Job>(), Arg.Any<IState>());
        Assert.AreEqual(JobId, env.ProjectSecrets.Get(Project02).ServalData!.PreTranslationJobId);
        Assert.IsNotNull(env.ProjectSecrets.Get(Project02).ServalData?.PreTranslationQueuedAt);
        Assert.IsNull(env.ProjectSecrets.Get(Project02).ServalData?.PreTranslationErrorMessage);
    }

    [Test]
    public async Task StartPreTranslationBuildAsync_AdditionalTrainingSource()
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
                        AdditionalTrainingSourceEnabled = true,
                        AdditionalTrainingSource = new TranslateSource { ProjectRef = Project01 },
                    }
                )
        );

        // SUT
        await env.Service.StartPreTranslationBuildAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            CancellationToken.None
        );

        await env
            .SyncService.Received(1)
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
            () => env.Service.TrainSegmentAsync(User02, Project01, new SegmentPair(), CancellationToken.None)
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
    public void TrainSegmentAsync_NoTranslationEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.TrainSegmentAsync(User01, Project03, new SegmentPair(), CancellationToken.None)
        );
    }

    [Test]
    public void TrainSegmentAsync_ServalOutage()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient.TrainSegmentAsync(
                TranslationEngine01,
                Arg.Any<SegmentPair>(),
                CancellationToken.None
            )
            .Throws(new BrokenCircuitException());

        // SUT
        Assert.ThrowsAsync<BrokenCircuitException>(
            () => env.Service.TrainSegmentAsync(User01, Project01, new SegmentPair(), CancellationToken.None)
        );
    }

    [Test]
    public async Task TrainSegmentAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        await env.Service.TrainSegmentAsync(User01, Project01, new SegmentPair(), CancellationToken.None);

        await env
            .TranslationEnginesClient.Received(1)
            .TrainSegmentAsync(TranslationEngine01, Arg.Any<SegmentPair>(), CancellationToken.None);
    }

    [Test]
    public void TranslateAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(
            () => env.Service.TranslateAsync(User02, Project01, Segment, CancellationToken.None)
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
    public void TranslateAsync_NoTranslationEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.TranslateAsync(User01, Project03, Segment, CancellationToken.None)
        );
    }

    [Test]
    public void TranslateAsync_ServalOutage()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient.TranslateAsync(TranslationEngine01, Segment, CancellationToken.None)
            .Throws(new BrokenCircuitException());

        // SUT
        Assert.ThrowsAsync<BrokenCircuitException>(
            () => env.Service.TranslateAsync(User01, Project01, Segment, CancellationToken.None)
        );
    }

    [Test]
    public async Task TranslateAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient.TranslateAsync(TranslationEngine01, Segment, CancellationToken.None)
            .Returns(
                Task.FromResult(
                    new TranslationResult
                    {
                        Alignment = [new AlignedWordPair()],
                        Confidences = [0.0],
                        Phrases = [new Phrase()],
                        Sources =
                        [
                            [TranslationSource.Primary],
                        ],
                        TargetTokens = [TargetSegment],
                        SourceTokens = [Segment],
                        Translation = TargetSegment,
                    }
                )
            );

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
    public void TranslateNAsync_NoPermission()
    {
        // Set up test environment
        const int n = 1;
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(
            () => env.Service.TranslateNAsync(User02, Project01, n, Segment, CancellationToken.None)
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
    public void TranslateNAsync_NoTranslationEngine()
    {
        // Set up test environment
        const int n = 1;
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.TranslateNAsync(User01, Project03, n, Segment, CancellationToken.None)
        );
    }

    [Test]
    public void TranslateNAsync_ServalOutage()
    {
        // Set up test environment
        const int n = 1;
        var env = new TestEnvironment();
        env.TranslationEnginesClient.TranslateNAsync(TranslationEngine01, n, Segment, CancellationToken.None)
            .Throws(new BrokenCircuitException());

        // SUT
        Assert.ThrowsAsync<BrokenCircuitException>(
            () => env.Service.TranslateNAsync(User01, Project01, n, Segment, CancellationToken.None)
        );
    }

    [Test]
    public async Task TranslateNAsync_Success()
    {
        // Set up test environment
        const int n = 1;
        var env = new TestEnvironment();
        env.TranslationEnginesClient.TranslateNAsync(TranslationEngine01, n, Segment, CancellationToken.None)
            .Returns(
                Task.FromResult<IList<TranslationResult>>(
                    [
                        new TranslationResult
                        {
                            Alignment = [new AlignedWordPair()],
                            Confidences = [0.0],
                            Phrases = [new Phrase()],
                            Sources =
                            [
                                [TranslationSource.Primary],
                            ],
                            TargetTokens = [TargetSegment],
                            SourceTokens = [Segment],
                            Translation = TargetSegment,
                        },
                    ]
                )
            );

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

    private class TestEnvironment
    {
        public TestEnvironment()
        {
            BackgroundJobClient = Substitute.For<IBackgroundJobClient>();
            BackgroundJobClient.Create(Arg.Any<Job>(), Arg.Any<IState>()).Returns(JobId);
            ExceptionHandler = Substitute.For<IExceptionHandler>();

            MachineProjectService = Substitute.For<IMachineProjectService>();
            MachineProjectService
                .GetTranslationEngineTypeAsync(preTranslate: true)
                .Returns(Task.FromResult(Services.MachineProjectService.Nmt));
            MockLogger = new MockLogger<MachineApiService>();
            ParatextService = Substitute.For<IParatextService>();
            PreTranslationService = Substitute.For<IPreTranslationService>();
            ProjectSecrets = new MemoryRepository<SFProjectSecret>(
                [
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
                        ServalData = new ServalData { PreTranslationEngineId = TranslationEngine01 },
                    },
                ]
            );
            Projects = new MemoryRepository<SFProject>(
                [
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
                                AlternateSourceEnabled = true,
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
                ]
            );
            ProjectService = Substitute.For<ISFProjectService>();
            ProjectService.SyncAsync(User01, Arg.Any<string>()).Returns(Task.FromResult(JobId));
            var realtimeService = new SFMemoryRealtimeService();
            realtimeService.AddRepository("sf_projects", OTType.Json0, Projects);

            var servalOptions = Options.Create(new ServalOptions { WebhookSecret = "this_is_a_secret" });
            SyncService = Substitute.For<ISyncService>();
            SyncService.SyncAsync(Arg.Any<SyncConfig>()).Returns(Task.FromResult(JobId));
            TranslationEnginesClient = Substitute.For<ITranslationEnginesClient>();
            TranslationEnginesClient
                .GetAsync(TranslationEngine01, CancellationToken.None)
                .Returns(Task.FromResult(new TranslationEngine()));
            TranslationEngineTypesClient = Substitute.For<ITranslationEngineTypesClient>();

            Service = new MachineApiService(
                BackgroundJobClient,
                ExceptionHandler,
                MockLogger,
                MachineProjectService,
                ParatextService,
                PreTranslationService,
                ProjectSecrets,
                ProjectService,
                realtimeService,
                servalOptions,
                SyncService,
                TranslationEnginesClient,
                TranslationEngineTypesClient
            );
        }

        public IBackgroundJobClient BackgroundJobClient { get; }
        public IExceptionHandler ExceptionHandler { get; }
        public IMachineProjectService MachineProjectService { get; }
        public MockLogger<MachineApiService> MockLogger { get; }
        public IParatextService ParatextService { get; }
        public IPreTranslationService PreTranslationService { get; }
        public MemoryRepository<SFProject> Projects { get; }
        public MemoryRepository<SFProjectSecret> ProjectSecrets { get; }
        public ISFProjectService ProjectService { get; }
        public MachineApiService Service { get; }
        public ISyncService SyncService { get; }
        public ITranslationEnginesClient TranslationEnginesClient { get; }
        public ITranslationEngineTypesClient TranslationEngineTypesClient { get; }

        public async Task QueueBuildAsync(bool preTranslate, DateTime? dateTime = null, string? errorMessage = null) =>
            await ProjectSecrets.UpdateAsync(
                Project01,
                u =>
                {
                    if (preTranslate)
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
                    else
                    {
                        u.Set(p => p.ServalData.TranslationJobId, JobId);
                        u.Set(p => p.ServalData.TranslationQueuedAt, dateTime ?? DateTime.UtcNow);
                        if (string.IsNullOrWhiteSpace(errorMessage))
                        {
                            u.Unset(p => p.ServalData.TranslationErrorMessage);
                        }
                        else
                        {
                            u.Set(p => p.ServalData.TranslationErrorMessage, errorMessage);
                        }
                    }
                }
            );
    }
}
