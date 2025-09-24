using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using Hangfire;
using Hangfire.Common;
using Hangfire.States;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using NSubstitute.Extensions;
using NUnit.Framework;
using Polly.CircuitBreaker;
using Serval.Client;
using SIL.Converters.Usj;
using SIL.Scripture;
using SIL.XForge.DataAccess;
using SIL.XForge.EventMetrics;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.RichText;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Realtime;
using SIL.XForge.Services;
using SIL.XForge.Utils;
using Options = Microsoft.Extensions.Options.Options;
using ServalOptions = SIL.XForge.Configuration.ServalOptions;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class MachineApiServiceTests
{
    private const string Project01 = "project01";
    private const string Project02 = "project02";
    private const string Project03 = "project03";
    private const string Build01 = "build01";
    private const string ParallelCorpusId01 = "parallelCorpusId01";
    private const string TranslationEngine01 = "translationEngine01";
    private const string TrainingDataId01 = "trainingDataId01";
    private const string User01 = "user01";
    private const string User02 = "user02";
    private const string Paratext01 = "paratext01";
    private const string Paratext02 = "paratext02";
    private const string ParatextUserId01 = "paratextUser01";
    private const string Segment = "segment";
    private const string TargetSegment = "targetSegment";
    private const string JobId = "jobId";
    private const string Data01 = "data01";

    private const string JsonPayload =
        """{"event":"TranslationBuildFinished","payload":{"build":{"id":"65f0c455682bb17bc4066917","url":"/api/v1/translation/engines/translationEngine01/builds/65f0c455682bb17bc4066917"},"engine":{"id":"translationEngine01","url":"/api/v1/translation/engines/translationEngine01"},"buildState":"Completed","dateFinished":"2024-03-12T21:14:10.789Z"}}""";

    private const string TestUsfm = "\\c 1 \\v 1 Verse 1";
    private const string TestUsx =
        "<usx version=\"3.0\"><book code=\"MAT\" style=\"id\"></book><chapter number=\"1\" style=\"c\" />"
        + "<verse number=\"1\" style=\"v\" />Verse 1</usx>";
    private static readonly Usj TestEmptyUsj = new Usj
    {
        Type = Usj.UsjType,
        Version = Usj.UsjVersion,
        Content = [],
    };
    private static readonly Usj TestUsj = new Usj
    {
        Type = Usj.UsjType,
        Version = Usj.UsjVersion,
        Content =
        [
            new UsjMarker
            {
                Type = "book",
                Marker = "id",
                Code = "MAT",
            },
            new UsjMarker
            {
                Type = "chapter",
                Marker = "c",
                Number = "1",
            },
            new UsjMarker
            {
                Type = "verse",
                Marker = "v",
                Number = "1",
            },
            "Verse 1",
        ],
    };

    private static readonly TranslationBuild CompletedTranslationBuild = new TranslationBuild
    {
        Url = "https://example.com",
        Id = Build01,
        Engine = { Id = "engineId", Url = "https://example.com" },
        Message = "Completed",
        Progress = 0,
        Revision = 43,
        State = JobState.Completed,
        DateFinished = DateTimeOffset.UtcNow,
    };

    [Test]
    public async Task ApplyPreTranslationToProjectAsync_BlankUsjFromMongo()
    {
        // Set up test environment
        var env = new TestEnvironment();
        TextDocument textDocument = new TextDocument
        {
            Id = TextDocument.GetDocId(Project01, 31, 1, TextDocument.Draft),
            Type = Usj.UsjType,
            Version = Usj.UsjVersion,
            Content = [],
        };
        env.TextDocuments.Add(textDocument);

        // SUT
        DraftApplyResult actual = await env.Service.ApplyPreTranslationToProjectAsync(
            User01,
            Project01,
            scriptureRange: "OBA",
            Project02,
            DateTime.UtcNow,
            CancellationToken.None
        );

        Assert.That(actual.Log, Is.Empty);
        Assert.That(actual.Failures, Is.Not.Empty);
        Assert.That(actual.Failures.First(), Is.EqualTo("OBA 1"));
        Assert.That(actual.ChangesSaved, Is.False);
    }

    [Test]
    public async Task ApplyPreTranslationToProjectAsync_BlankUsjFromServal()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string usfm = "\\id OBA\r\n\\c 1\r\n\\v 1 Verse 1";
        env.PreTranslationService.GetPreTranslationUsfmAsync(
                Project01,
                bookNum: 31,
                chapterNum: 0,
                Arg.Any<DraftUsfmConfig>(),
                CancellationToken.None
            )
            .Returns(Task.FromResult(usfm));
        env.ParatextService.GetChaptersAsUsj(Arg.Any<UserSecret>(), Paratext01, bookNum: 31, usfm)
            .Returns([UsxToUsj.UsxXmlDocumentToUsj(null)]);

        // SUT
        DraftApplyResult actual = await env.Service.ApplyPreTranslationToProjectAsync(
            User01,
            Project01,
            scriptureRange: "OBA",
            Project02,
            DateTime.UtcNow,
            CancellationToken.None
        );

        Assert.That(actual.Log, Is.Empty);
        Assert.That(actual.Failures, Is.Not.Empty);
        Assert.That(actual.Failures.First(), Is.EqualTo("OBA 1"));
        Assert.That(actual.ChangesSaved, Is.False);
    }

    [Test]
    public async Task ApplyPreTranslationToProjectAsync_DifferentVersification()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.ConfigureDraft(
            Project01,
            bookNum: 106,
            numberOfChapters: 2,
            bookExists: true,
            draftExists: true,
            canWriteBook: true,
            writeChapters: 1
        );

        // 6 Ezra has max 12 chapters (either 1-2 or 11-12) in Vulgate and 1 chapter in English
        env.ParatextService.GetParatextSettings(Arg.Any<UserSecret>(), Paratext01)
            .Returns(new ParatextSettings { Versification = ScrVers.Vulgate });
        env.ParatextService.GetParatextSettings(Arg.Any<UserSecret>(), Paratext02)
            .Returns(new ParatextSettings { Versification = ScrVers.English });

        // SUT
        DraftApplyResult actual = await env.Service.ApplyPreTranslationToProjectAsync(
            User01,
            Project01,
            scriptureRange: "6EZ",
            Project02,
            DateTime.UtcNow,
            CancellationToken.None
        );

        await env.VerifyDraftAsync(
            actual,
            Project02,
            numberOfChapters: 2,
            bookExists: true,
            canWriteBook: true,
            writeChapters: 1
        );
        env.MockLogger.AssertHasEvent(logEvent => logEvent.LogLevel == LogLevel.Warning);
        Assert.That(actual.Log, Is.Not.Empty);
        Assert.That(actual.Failures, Is.Not.Empty);
        Assert.That(actual.Failures.First(), Is.EqualTo("6EZ 2"));
    }

    [Test]
    public async Task ApplyPreTranslationToProjectAsync_ExceptionFromParatext()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.ConfigureDraft(
            Project01,
            bookNum: 39,
            numberOfChapters: 3,
            bookExists: true,
            draftExists: true,
            canWriteBook: true,
            writeChapters: 3
        );
        env.ProjectService.UpdatePermissionsAsync(
                Arg.Any<string>(),
                Arg.Any<IDocument<SFProject>>(),
                users: null,
                books: Arg.Any<IReadOnlyList<int>>(),
                CancellationToken.None
            )
            .ThrowsAsync(new NotSupportedException());

        // SUT
        DraftApplyResult actual = await env.Service.ApplyPreTranslationToProjectAsync(
            User01,
            Project01,
            scriptureRange: "MAL",
            targetProjectId: Project02,
            DateTime.UtcNow,
            CancellationToken.None
        );

        env.MockLogger.AssertHasEvent(logEvent => logEvent.Exception?.GetType() == typeof(NotSupportedException));
        env.ExceptionHandler.Received().ReportException(Arg.Any<NotSupportedException>());
        Assert.That(actual.Log, Is.Not.Empty);
        Assert.That(actual.ChangesSaved, Is.False);
    }

    [Test]
    public async Task ApplyPreTranslationToProjectAsync_InvalidBookId()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string usfm = "\\id EXO Should Be GEN\r\n\\c 1\r\n\\v 1 Verse 1";
        env.PreTranslationService.GetPreTranslationUsfmAsync(
                Project01,
                1,
                chapterNum: 0,
                Arg.Any<DraftUsfmConfig>(),
                CancellationToken.None
            )
            .Returns(Task.FromResult(usfm));

        // SUT
        DraftApplyResult actual = await env.Service.ApplyPreTranslationToProjectAsync(
            User01,
            Project01,
            scriptureRange: "GEN",
            Project02,
            DateTime.UtcNow,
            CancellationToken.None
        );

        Assert.That(actual.Log, Is.Empty);
        Assert.That(actual.Failures, Is.Not.Empty);
        Assert.That(actual.Failures.First(), Is.EqualTo("GEN"));
        Assert.That(actual.ChangesSaved, Is.False);
    }

    [Test]
    public async Task ApplyPreTranslationToProjectAsync_RequestEarlierThanLocalDraft()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.ConfigureDraft(
            Project01,
            bookNum: 1,
            numberOfChapters: 50,
            bookExists: true,
            draftExists: true,
            canWriteBook: true,
            writeChapters: 50
        );

        // SUT
        DraftApplyResult actual = await env.Service.ApplyPreTranslationToProjectAsync(
            User01,
            Project01,
            scriptureRange: "GEN",
            Project02,
            DateTime.MinValue,
            CancellationToken.None
        );

        await env.VerifyDraftAsync(
            actual,
            Project02,
            numberOfChapters: 50,
            bookExists: true,
            canWriteBook: true,
            writeChapters: 50
        );
    }

    [Test]
    public async Task ApplyPreTranslationToProjectAsync_MissingTargetProject()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        DraftApplyResult actual = await env.Service.ApplyPreTranslationToProjectAsync(
            User01,
            Project01,
            scriptureRange: "GEN",
            targetProjectId: "invalid_project_id",
            DateTime.UtcNow,
            CancellationToken.None
        );

        env.MockLogger.AssertHasEvent(logEvent => logEvent.Exception?.GetType() == typeof(DataNotFoundException));
        env.ExceptionHandler.Received()
            .ReportException(Arg.Is<DataNotFoundException>(e => e.Message.Contains("project")));
        Assert.That(actual.Log, Is.Not.Empty);
        Assert.That(actual.ChangesSaved, Is.False);
    }

    [Test]
    public async Task ApplyPreTranslationToProjectAsync_MissingUserSecret()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.UserSecrets.DeleteAllAsync(_ => true);

        // SUT
        DraftApplyResult actual = await env.Service.ApplyPreTranslationToProjectAsync(
            User01,
            Project01,
            scriptureRange: "GEN",
            Project02,
            DateTime.UtcNow,
            CancellationToken.None
        );

        env.MockLogger.AssertHasEvent(logEvent => logEvent.Exception?.GetType() == typeof(DataNotFoundException));
        env.ExceptionHandler.Received().ReportException(Arg.Is<DataNotFoundException>(e => e.Message.Contains("user")));
        Assert.That(actual.Log, Is.Not.Empty);
        Assert.That(actual.ChangesSaved, Is.False);
    }

    [Test]
    public async Task ApplyPreTranslationToProjectAsync_NoChapterDeltas()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        DraftApplyResult actual = await env.Service.ApplyPreTranslationToProjectAsync(
            User01,
            Project01,
            scriptureRange: "GEN",
            Project02,
            DateTime.UtcNow,
            CancellationToken.None
        );

        await env
            .ProjectService.DidNotReceive()
            .UpdatePermissionsAsync(
                User01,
                Arg.Any<IDocument<SFProject>>(),
                users: null,
                books: Arg.Any<IReadOnlyList<int>>(),
                CancellationToken.None
            );
        Assert.That(actual.ChangesSaved, Is.False);
    }

    [Test]
    public async Task ApplyPreTranslationToProjectAsync_Success(
        [Values(Project01, Project02)] string targetProjectId,
        [Values(true, false)] bool bookExists,
        [Values(true, false)] bool draftExists,
        [Values(true, false)] bool canWriteBook,
        [Values(true, false)] bool canWriteChapter
    )
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.ConfigureDraft(
            Project01,
            bookNum: 1,
            numberOfChapters: 50,
            bookExists,
            draftExists,
            canWriteBook,
            writeChapters: canWriteChapter ? 50 : 0
        );

        // SUT
        DraftApplyResult actual = await env.Service.ApplyPreTranslationToProjectAsync(
            User01,
            Project01,
            scriptureRange: "GEN",
            targetProjectId,
            DateTime.UtcNow,
            CancellationToken.None
        );

        await env.VerifyDraftAsync(
            actual,
            targetProjectId,
            numberOfChapters: 50,
            bookExists,
            canWriteBook,
            writeChapters: canWriteChapter ? 50 : 0
        );
    }

    [Test]
    public async Task BuildCompletedAsync_EventMetricInvalid()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.EventMetricService.GetEventMetricsAsync(Project01, Arg.Any<EventScope[]?>(), Arg.Any<string[]>())
            .Returns(
                Task.FromResult(
                    new QueryResults<EventMetric>
                    {
                        Results =
                        [
                            new EventMetric
                            {
                                EventType = nameof(MachineProjectService.BuildProjectAsync),
                                ProjectId = Project01,
                                Result = new BsonString(Build01),
                                Scope = EventScope.Drafting,
                                UserId = null,
                            },
                        ],
                        UnpagedCount = 1,
                    }
                )
            );

        // SUT
        await env.Service.BuildCompletedAsync(
            Project01,
            Build01,
            nameof(JobState.Completed),
            env.HttpRequestAccessor.SiteRoot
        );
        env.MockLogger.AssertHasEvent(logEvent => logEvent.LogLevel == LogLevel.Information);
    }

    [Test]
    public async Task BuildCompletedAsync_EventMetricMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.EventMetricService.GetEventMetricsAsync(Project01, Arg.Any<EventScope[]?>(), Arg.Any<string[]>())
            .Returns(Task.FromResult(QueryResults<EventMetric>.Empty));

        // SUT
        await env.Service.BuildCompletedAsync(
            Project01,
            Build01,
            nameof(JobState.Completed),
            env.HttpRequestAccessor.SiteRoot
        );
        env.MockLogger.AssertHasEvent(logEvent => logEvent.LogLevel == LogLevel.Information);
    }

    [Test]
    public async Task BuildCompletedAsync_Exception()
    {
        // Set up test environment
        var env = new TestEnvironment();
        ServalApiException ex = ServalApiExceptions.Forbidden;
        env.EventMetricService.GetEventMetricsAsync(Project01, Arg.Any<EventScope[]?>(), Arg.Any<string[]>())
            .ThrowsAsync(ex);

        // SUT
        await env.Service.BuildCompletedAsync(
            Project01,
            Build01,
            nameof(JobState.Completed),
            env.HttpRequestAccessor.SiteRoot
        );
        env.MockLogger.AssertHasEvent(logEvent => logEvent.Exception == ex);
        env.ExceptionHandler.Received().ReportException(ex);
    }

    [Test]
    public async Task BuildCompletedAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.EventMetricService.GetEventMetricsAsync(Project01, Arg.Any<EventScope[]?>(), Arg.Any<string[]>())
            .Returns(Task.FromResult(env.GetEventMetricsForBuildCompleted(true)));

        // SUT
        await env.Service.BuildCompletedAsync(
            Project01,
            Build01,
            nameof(JobState.Completed),
            env.HttpRequestAccessor.SiteRoot
        );
        await env
            .MachineProjectService.Received()
            .SendBuildCompletedEmailAsync(
                User01,
                Project01,
                Build01,
                nameof(JobState.Completed),
                env.HttpRequestAccessor.SiteRoot
            );
    }

    [Test]
    public async Task BuildCompletedAsync_UserDidNotRequestEmail()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.EventMetricService.GetEventMetricsAsync(Project01, Arg.Any<EventScope[]?>(), Arg.Any<string[]>())
            .Returns(Task.FromResult(env.GetEventMetricsForBuildCompleted(false)));

        // SUT
        await env.Service.BuildCompletedAsync(
            Project01,
            Build01,
            nameof(JobState.Completed),
            env.HttpRequestAccessor.SiteRoot
        );
        await env
            .MachineProjectService.DidNotReceive()
            .SendBuildCompletedEmailAsync(
                Arg.Any<string>(),
                Arg.Any<string>(),
                Arg.Any<string>(),
                Arg.Any<string>(),
                Arg.Any<Uri>()
            );
    }

    [Test]
    public void CancelPreTranslationBuildAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(() =>
            env.Service.CancelPreTranslationBuildAsync(User02, Project01, CancellationToken.None)
        );
    }

    [Test]
    public void CancelPreTranslationBuildAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.CancelPreTranslationBuildAsync(User01, "invalid_project_id", CancellationToken.None)
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
        Assert.ThrowsAsync<NotSupportedException>(() =>
            env.Service.CancelPreTranslationBuildAsync(User01, Project01, CancellationToken.None)
        );
    }

    [Test]
    public void CancelPreTranslationBuildAsync_NoTranslationEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.CancelPreTranslationBuildAsync(User01, Project03, CancellationToken.None)
        );
    }

    [Test]
    public async Task CancelPreTranslationBuildAsync_NoTranslationEngineAndJobQueued()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.ProjectSecrets.UpdateAsync(Project01, op => op.Unset(p => p.ServalData.PreTranslationEngineId));
        await env.QueueBuildAsync(Project01, preTranslate: true, dateTime: DateTime.UtcNow);

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.CancelPreTranslationBuildAsync(User01, Project01, CancellationToken.None)
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
        await env.QueueBuildAsync(Project01, preTranslate: true, dateTime: DateTime.UtcNow);
        env.ConfigureTranslationBuild();

        // SUT
        string actual = await env.Service.CancelPreTranslationBuildAsync(User01, Project01, CancellationToken.None);
        Assert.AreEqual(Build01, actual);

        await env.TranslationEnginesClient.Received(1).CancelBuildAsync(TranslationEngine01, CancellationToken.None);
        env.BackgroundJobClient.Received(1).ChangeState(JobId, Arg.Any<DeletedState>(), null); // Same as Delete()
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.PreTranslationJobId);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.PreTranslationQueuedAt);
    }

    [Test]
    public void CalculateSignature_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string expected = "sha256=8C8E8C11165F748AFC6621F1DB213F79CE52759757D9BD6382C94E92C5B31063";

        // SUT
        string actual = env.Service.CalculateSignature(JsonPayload);
        Assert.AreEqual(expected, actual);
    }

    [Test]
    public void ExecuteWebhook_InvalidSignature()
    {
        // Set up test environment
        var env = new TestEnvironment();
        string signature = env.Service.CalculateSignature("{}");

        // SUT
        Assert.ThrowsAsync<ArgumentException>(() => env.Service.ExecuteWebhookAsync(JsonPayload, signature));
    }

    [Test]
    public async Task ExecuteWebhook_MissingProjectId()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // Change payload.engine.id to "invalid_translation_id"
        JObject payload = JObject.Parse(JsonPayload);
        payload["payload"]!["engine"]!["id"] = "invalid_translation_id";
        string json = payload.ToString();
        string signature = env.Service.CalculateSignature(json);

        // SUT
        await env.Service.ExecuteWebhookAsync(json, signature);
        env.MockLogger.AssertHasEvent(logEvent => logEvent.LogLevel == LogLevel.Warning);
    }

    [Test]
    public void ExecuteWebhook_MissingTranslationEngineId()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // Remove payload.engine
        JObject payload = JObject.Parse(JsonPayload);
        ((JObject)payload["payload"])!.Remove("engine");
        string json = payload.ToString();
        string signature = env.Service.CalculateSignature(json);

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() => env.Service.ExecuteWebhookAsync(json, signature));
    }

    [Test]
    public async Task ExecuteWebhook_UnsupportedBuildState()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // Change payload.buildState to "Faulted"
        JObject payload = JObject.Parse(JsonPayload);
        payload["payload"]!["buildState"] = "Faulted";
        string json = payload.ToString();
        string signature = env.Service.CalculateSignature(json);

        // SUT
        await env.Service.ExecuteWebhookAsync(json, signature);
        // One job: BuildCompletedAsync
        env.BackgroundJobClient.Received(1).Create(Arg.Any<Job>(), Arg.Any<IState>());
    }

    [Test]
    public async Task ExecuteWebhook_UnsupportedEvent()
    {
        // Set up test environment
        var env = new TestEnvironment();
        JObject payload = JObject.Parse(JsonPayload);

        // Change event to "TranslationBuildStarted"
        payload["event"] = "TranslationBuildStarted";
        string json = payload.ToString();
        string signature = env.Service.CalculateSignature(json);

        // SUT
        await env.Service.ExecuteWebhookAsync(json, signature);
        env.BackgroundJobClient.DidNotReceive().Create(Arg.Any<Job>(), Arg.Any<IState>());
    }

    [Test]
    public async Task ExecuteWebhook_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        string signature = env.Service.CalculateSignature(JsonPayload);

        // SUT
        await env.Service.ExecuteWebhookAsync(JsonPayload, signature);
        // Two jobs: BuildCompletedAsync & RetrievePreTranslationStatusAsync
        env.BackgroundJobClient.Received(2).Create(Arg.Any<Job>(), Arg.Any<IState>());
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
        Assert.ThrowsAsync<DataNotFoundException>(() =>
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
        Assert.ThrowsAsync<ForbiddenException>(() =>
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
        Assert.ThrowsAsync<DataNotFoundException>(() =>
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
        Assert.ThrowsAsync<DataNotFoundException>(() =>
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
        env.ConfigureTranslationBuild();

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
        TranslationBuild translationBuild = env.ConfigureTranslationBuild();

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

        TestEnvironment.AssertCoreBuildProperties(translationBuild, actual);
        Assert.NotNull(actual.AdditionalInfo);
        Assert.AreEqual(
            new ProjectScriptureRange { ScriptureRange = "GEN" },
            actual.AdditionalInfo.TranslationScriptureRanges.Single()
        );
        Assert.AreEqual(
            new ProjectScriptureRange { ScriptureRange = "EXO" },
            actual.AdditionalInfo.TrainingScriptureRanges.Single()
        );
    }

    [Test]
    public async Task GetBuildAsync_IncludesAdditionalInfo()
    {
        // Set up test environment
        var env = new TestEnvironment();
        ObjectId buildObjectId = new ObjectId();
        string buildId = buildObjectId.ToString();
        const string message = "Finalizing";
        const double percentCompleted = 0.95;
        const int revision = 553;
        const JobState state = JobState.Active;
        const int queueDepth = 7;
        DateTimeOffset dateFinished = DateTimeOffset.UtcNow;
        const string engineId = "engineId1";
        const string corpusId1 = "corpusId1";
        const string corpusId2 = "corpusId2";
        const string corpusId3 = "corpusId3";
        const string corpusId4 = "corpusId4";
        const string parallelCorpusId1 = ParallelCorpusId01;
        const string parallelCorpusId2 = "parallelCorpusId2";
        const int step = 123;

        // Create a complex translation build
        TranslationBuild translationBuild = new TranslationBuild
        {
            Url = "https://example.com",
            Id = buildId,
            Engine = { Id = engineId, Url = "https://example.com" },
            Message = message,
            Progress = percentCompleted,
            Revision = revision,
            State = state,
            DateFinished = dateFinished,
            QueueDepth = queueDepth,
            Step = step,
            Pretranslate =
            [
                new PretranslateCorpus
                {
                    ParallelCorpus = new ResourceLink { Id = parallelCorpusId1, Url = "https://example.com" },
                },
                new PretranslateCorpus
                {
                    ParallelCorpus = new ResourceLink { Id = parallelCorpusId2, Url = "https://example.com" },
                },
                new PretranslateCorpus
                {
                    SourceFilters =
                    [
                        new ParallelCorpusFilter { Corpus = { Id = corpusId1, Url = "https://example.com" } },
                        new ParallelCorpusFilter { Corpus = { Id = corpusId2, Url = "https://example.com" } },
                    ],
                },
                // Invalid corpus format
                new PretranslateCorpus(),
            ],
            TrainOn =
            [
                new TrainingCorpus
                {
                    ParallelCorpus = new ResourceLink { Id = corpusId3, Url = "https://example.com" },
                },
                new TrainingCorpus
                {
                    SourceFilters =
                    [
                        new ParallelCorpusFilter { Corpus = { Id = corpusId3, Url = "https://example.com" } },
                    ],
                    TargetFilters =
                    [
                        new ParallelCorpusFilter { Corpus = { Id = corpusId4, Url = "https://example.com" } },
                    ],
                },
                // Invalid corpus format
                new TrainingCorpus(),
            ],
            Analysis =
            [
                new ParallelCorpusAnalysis
                {
                    ParallelCorpusRef = parallelCorpusId1,
                    SourceQuoteConvention = "standard_english",
                    TargetQuoteConvention = "standard_english",
                },
            ],
        };
        env.ConfigureTranslationBuild(translationBuild);

        // SUT
        ServalBuildDto? actual = await env.Service.GetBuildAsync(
            User01,
            Project01,
            buildId,
            minRevision: null,
            preTranslate: false,
            isServalAdmin: false,
            CancellationToken.None
        );

        Assert.IsNotNull(actual);
        TestEnvironment.AssertCoreBuildProperties(translationBuild, actual);
        Assert.AreEqual(queueDepth, actual!.QueueDepth);
        Assert.IsNotNull(actual.AdditionalInfo);
        Assert.AreEqual(buildId, actual.AdditionalInfo!.BuildId);
        Assert.AreEqual(dateFinished, actual.AdditionalInfo.DateFinished);
        Assert.AreEqual(
            new DateTimeOffset(buildObjectId.CreationTime, TimeSpan.Zero),
            actual.AdditionalInfo!.DateRequested
        );
        Assert.AreEqual(step, actual.AdditionalInfo.Step);
        Assert.AreEqual(engineId, actual.AdditionalInfo.TranslationEngineId);
        Assert.IsNotNull(actual.AdditionalInfo.CorporaIds);
        Assert.AreEqual(4, actual.AdditionalInfo.CorporaIds!.Count());
        Assert.AreEqual(corpusId1, actual.AdditionalInfo.CorporaIds.ElementAt(0));
        Assert.AreEqual(corpusId2, actual.AdditionalInfo.CorporaIds.ElementAt(1));
        Assert.AreEqual(corpusId3, actual.AdditionalInfo.CorporaIds.ElementAt(2));
        Assert.AreEqual(corpusId4, actual.AdditionalInfo.CorporaIds.ElementAt(3));
        Assert.IsNotNull(actual.AdditionalInfo.ParallelCorporaIds);
        Assert.AreEqual(parallelCorpusId1, actual.AdditionalInfo.ParallelCorporaIds!.ElementAt(0));
        Assert.AreEqual(parallelCorpusId2, actual.AdditionalInfo.ParallelCorporaIds.ElementAt(1));
        Assert.AreEqual(TrainingDataId01, actual.AdditionalInfo.TrainingDataFileIds.Single());
        Assert.AreEqual(actual.AdditionalInfo.QuotationDenormalization, QuotationAnalysis.Successful);
    }

    [Test]
    public void GetBuildsAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(() =>
            env.Service.GetBuildsAsync(
                User02,
                Project01,
                preTranslate: false,
                isServalAdmin: false,
                CancellationToken.None
            )
        );
    }

    [Test]
    public void GetBuildsAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.GetBuildsAsync(
                User01,
                "invalid_project_id",
                preTranslate: false,
                isServalAdmin: false,
                CancellationToken.None
            )
        );
    }

    [Test]
    public void GetBuildsAsync_NoTranslationEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.GetBuildsAsync(
                User01,
                Project03,
                preTranslate: false,
                isServalAdmin: false,
                CancellationToken.None
            )
        );
    }

    [Test]
    public async Task GetBuildsAsync_QueuedState()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.QueueBuildAsync(Project01, preTranslate: true, dateTime: DateTime.UtcNow);
        env.TranslationEnginesClient.GetAllBuildsAsync(TranslationEngine01, CancellationToken.None)
            .Returns(Task.FromResult<IList<TranslationBuild>>([]));
        env.EventMetricService.GetEventMetricsAsync(Project01, Arg.Any<EventScope[]?>(), Arg.Any<string[]>())
            .Returns(Task.FromResult(QueryResults<EventMetric>.Empty));

        // SUT
        IReadOnlyList<ServalBuildDto> builds = await env.Service.GetBuildsAsync(
            User02,
            Project01,
            preTranslate: true,
            isServalAdmin: true,
            CancellationToken.None
        );

        Assert.AreEqual(1, builds.Count);
        Assert.AreEqual(MachineApiService.BuildStateQueued, builds[0].State);
        Assert.AreEqual(Project01, builds[0].Id);
    }

    [Test]
    public async Task GetBuildsAsync_QueuedStateWithEventMetric()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string trainingScriptureRange = "GEN;EXO";
        const string translationScriptureRange = "LEV;NUM";
        DateTime requestedDateTime = DateTime.UtcNow;
        await env.QueueBuildAsync(Project01, preTranslate: true, dateTime: DateTime.UtcNow);
        env.TranslationEnginesClient.GetAllBuildsAsync(TranslationEngine01, CancellationToken.None)
            .Returns(Task.FromResult<IList<TranslationBuild>>([]));
        env.EventMetricService.GetEventMetricsAsync(Project01, Arg.Any<EventScope[]?>(), Arg.Any<string[]>())
            .Returns(
                Task.FromResult(
                    new QueryResults<EventMetric>
                    {
                        Results =
                        [
                            new EventMetric
                            {
                                EventType = nameof(MachineApiService.StartPreTranslationBuildAsync),
                                Payload =
                                {
                                    {
                                        "buildConfig",
                                        BsonDocument.Parse(
                                            JsonConvert.SerializeObject(
                                                new BuildConfig
                                                {
                                                    TrainingScriptureRanges =
                                                    [
                                                        new ProjectScriptureRange
                                                        {
                                                            ProjectId = Project02,
                                                            ScriptureRange = trainingScriptureRange,
                                                        },
                                                    ],
                                                    TranslationScriptureRanges =
                                                    [
                                                        new ProjectScriptureRange
                                                        {
                                                            ProjectId = Project03,
                                                            ScriptureRange = translationScriptureRange,
                                                        },
                                                    ],
                                                    ProjectId = Project01,
                                                }
                                            )
                                        )
                                    },
                                },
                                ProjectId = Project01,
                                Scope = EventScope.Drafting,
                                TimeStamp = requestedDateTime,
                                UserId = User01,
                            },
                        ],
                        UnpagedCount = 1,
                    }
                )
            );

        // SUT
        IReadOnlyList<ServalBuildDto> builds = await env.Service.GetBuildsAsync(
            User02,
            Project01,
            preTranslate: true,
            isServalAdmin: true,
            CancellationToken.None
        );

        Assert.AreEqual(1, builds.Count);
        Assert.AreEqual(MachineApiService.BuildStateQueued, builds[0].State);
        Assert.AreEqual(Project01, builds[0].Id);
        Assert.AreEqual(new DateTimeOffset(requestedDateTime, TimeSpan.Zero), builds[0].AdditionalInfo?.DateRequested);
        Assert.AreEqual(User01, builds[0].AdditionalInfo?.RequestedByUserId);
        Assert.AreEqual(Project02, builds[0].AdditionalInfo?.TrainingScriptureRanges.First().ProjectId);
        Assert.AreEqual(
            trainingScriptureRange,
            builds[0].AdditionalInfo?.TrainingScriptureRanges.First().ScriptureRange
        );
        Assert.AreEqual(Project03, builds[0].AdditionalInfo?.TranslationScriptureRanges.First().ProjectId);
        Assert.AreEqual(
            translationScriptureRange,
            builds[0].AdditionalInfo?.TranslationScriptureRanges.First().ScriptureRange
        );
    }

    [Test]
    public async Task GetBuildsAsync_ServalAdminDoesNotNeedPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.ConfigureTranslationBuild();
        env.EventMetricService.GetEventMetricsAsync(Project01, Arg.Any<EventScope[]?>(), Arg.Any<string[]>())
            .Returns(Task.FromResult(QueryResults<EventMetric>.Empty));

        // SUT
        IReadOnlyList<ServalBuildDto> builds = await env.Service.GetBuildsAsync(
            User02,
            Project01,
            preTranslate: true,
            isServalAdmin: true,
            CancellationToken.None
        );

        Assert.AreEqual(1, builds.Count);
    }

    [Test]
    public void GetBuildsAsync_ServalApiException()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient.GetAllBuildsAsync(TranslationEngine01, CancellationToken.None)
            .Throws(ServalApiExceptions.NotFound);

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.GetBuildsAsync(
                User01,
                Project01,
                preTranslate: false,
                isServalAdmin: false,
                CancellationToken.None
            )
        );
    }

    [Test]
    public async Task GetBuildsAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        TranslationBuild translationBuild = env.ConfigureTranslationBuild();
        env.EventMetricService.GetEventMetricsAsync(Project01, Arg.Any<EventScope[]?>(), Arg.Any<string[]>())
            .Returns(Task.FromResult(QueryResults<EventMetric>.Empty));

        // SUT
        IReadOnlyList<ServalBuildDto> builds = await env.Service.GetBuildsAsync(
            User02,
            Project01,
            preTranslate: true,
            isServalAdmin: true,
            CancellationToken.None
        );

        Assert.AreEqual(1, builds.Count);
        TestEnvironment.AssertCoreBuildProperties(translationBuild, builds[0]);
        Assert.NotNull(builds[0].AdditionalInfo);
    }

    [Test]
    public async Task GetBuildsAsync_SuccessWithEventMetrics()
    {
        // Set up test environment
        var env = new TestEnvironment();
        TranslationBuild translationBuild = env.ConfigureTranslationBuild();
        translationBuild.Analysis =
        [
            new ParallelCorpusAnalysis
            {
                ParallelCorpusRef = ParallelCorpusId01,
                SourceQuoteConvention = "standard_english",
                TargetQuoteConvention = "standard_english",
            },
        ];
        translationBuild.Pretranslate =
        [
            new PretranslateCorpus { ParallelCorpus = new ResourceLink { Id = ParallelCorpusId01 } },
        ];
        const string trainingScriptureRange = "GEN;EXO";
        const string translationScriptureRange = "LEV;NUM";
        env.EventMetricService.GetEventMetricsAsync(Project01, Arg.Any<EventScope[]?>(), Arg.Any<string[]>())
            .Returns(
                Task.FromResult(
                    new QueryResults<EventMetric>
                    {
                        Results =
                        [
                            new EventMetric
                            {
                                EventType = nameof(MachineProjectService.BuildProjectAsync),
                                Payload =
                                {
                                    {
                                        "buildConfig",
                                        BsonDocument.Parse(
                                            JsonConvert.SerializeObject(
                                                new BuildConfig
                                                {
                                                    TrainingScriptureRanges =
                                                    [
                                                        new ProjectScriptureRange
                                                        {
                                                            ProjectId = Project02,
                                                            ScriptureRange = trainingScriptureRange,
                                                        },
                                                    ],
                                                    TranslationScriptureRanges =
                                                    [
                                                        new ProjectScriptureRange
                                                        {
                                                            ProjectId = Project02,
                                                            ScriptureRange = translationScriptureRange,
                                                        },
                                                    ],
                                                    TrainingDataFiles = [TrainingDataId01],
                                                }
                                            )
                                        )
                                    },
                                },
                                ProjectId = Project01,
                                Result = new BsonString(Build01),
                                Scope = EventScope.Drafting,
                            },
                            new EventMetric
                            {
                                EventType = nameof(MachineApiService.RetrievePreTranslationStatusAsync),
                                Payload = { { "sfProjectId", Project01 } },
                                ProjectId = Project01,
                                Result = new BsonString(Build01),
                                Scope = EventScope.Drafting,
                            },
                        ],
                        UnpagedCount = 1,
                    }
                )
            );

        // SUT
        IReadOnlyList<ServalBuildDto> builds = await env.Service.GetBuildsAsync(
            User02,
            Project01,
            preTranslate: true,
            isServalAdmin: true,
            CancellationToken.None
        );

        Assert.AreEqual(1, builds.Count);
        TestEnvironment.AssertCoreBuildProperties(translationBuild, builds[0]);
        Assert.NotNull(builds[0].AdditionalInfo);
        Assert.AreEqual(
            translationScriptureRange,
            builds[0].AdditionalInfo.TranslationScriptureRanges.Single().ScriptureRange
        );
        Assert.AreEqual(
            trainingScriptureRange,
            builds[0].AdditionalInfo.TrainingScriptureRanges.Single().ScriptureRange
        );
        Assert.AreEqual(TrainingDataId01, builds[0].AdditionalInfo.TrainingDataFileIds.Single());
        Assert.AreEqual(builds[0].AdditionalInfo!.QuotationDenormalization, QuotationAnalysis.Successful);
    }

    [Test]
    public async Task GetBuildsAsync_SuccessWithFallbackToLegacyBuild()
    {
        // Set up test environment
        var env = new TestEnvironment();
        TranslationBuild translationBuild = env.ConfigureTranslationBuild();

        // Add additional build properties
        const string translationScriptureRange = "GEN;EXO";
        const string trainingScriptureRange = "LEV;NUM";
#pragma warning disable CS0612 // Type or member is obsolete
        translationBuild.Pretranslate = [new PretranslateCorpus { ScriptureRange = translationScriptureRange }];
        translationBuild.TrainOn = [new TrainingCorpus { ScriptureRange = trainingScriptureRange }];
#pragma warning restore CS0612 // Type or member is obsolete

        env.EventMetricService.GetEventMetricsAsync(Project01, Arg.Any<EventScope[]?>(), Arg.Any<string[]>())
            .Returns(Task.FromResult(QueryResults<EventMetric>.Empty));

        // SUT
        IReadOnlyList<ServalBuildDto> builds = await env.Service.GetBuildsAsync(
            User02,
            Project01,
            preTranslate: true,
            isServalAdmin: true,
            CancellationToken.None
        );

        Assert.AreEqual(1, builds.Count);
        TestEnvironment.AssertCoreBuildProperties(translationBuild, builds[0]);
        Assert.NotNull(builds[0].AdditionalInfo);
        Assert.AreEqual(Project01, builds[0].AdditionalInfo?.TranslationScriptureRanges.Single().ProjectId);
        Assert.AreEqual(
            translationScriptureRange,
            builds[0].AdditionalInfo?.TranslationScriptureRanges.Single().ScriptureRange
        );
        Assert.AreEqual(
            trainingScriptureRange,
            builds[0].AdditionalInfo?.TrainingScriptureRanges.Single().ScriptureRange
        );
        Assert.AreEqual(builds[0].AdditionalInfo!.QuotationDenormalization, QuotationAnalysis.Unsuccessful);
    }

    [Test]
    public async Task GetBuildsAsync_SuccessWithFallbackToPreTranslateBuild()
    {
        // Set up test environment
        var env = new TestEnvironment();
        TranslationBuild translationBuild = env.ConfigureTranslationBuild();

        // Add additional build properties
        const string translationScriptureRange = "GEN;EXO";
        const string trainingScriptureRange = "LEV;NUM";
        translationBuild.Pretranslate =
        [
            new PretranslateCorpus
            {
                SourceFilters = [new ParallelCorpusFilter { ScriptureRange = translationScriptureRange }],
            },
        ];
        translationBuild.TrainOn =
        [
            new TrainingCorpus
            {
                SourceFilters = [new ParallelCorpusFilter { ScriptureRange = trainingScriptureRange }],
            },
        ];

        env.EventMetricService.GetEventMetricsAsync(Project01, Arg.Any<EventScope[]?>(), Arg.Any<string[]>())
            .Returns(Task.FromResult(QueryResults<EventMetric>.Empty));

        // SUT
        IReadOnlyList<ServalBuildDto> builds = await env.Service.GetBuildsAsync(
            User02,
            Project01,
            preTranslate: true,
            isServalAdmin: true,
            CancellationToken.None
        );

        Assert.AreEqual(1, builds.Count);
        TestEnvironment.AssertCoreBuildProperties(translationBuild, builds[0]);
        Assert.NotNull(builds[0].AdditionalInfo);
        Assert.AreEqual(Project01, builds[0].AdditionalInfo?.TranslationScriptureRanges.Single().ProjectId);
        Assert.AreEqual(
            translationScriptureRange,
            builds[0].AdditionalInfo?.TranslationScriptureRanges.Single().ScriptureRange
        );
        Assert.AreEqual(
            trainingScriptureRange,
            builds[0].AdditionalInfo?.TrainingScriptureRanges.Single().ScriptureRange
        );
        Assert.AreEqual(builds[0].AdditionalInfo!.QuotationDenormalization, QuotationAnalysis.Unsuccessful);
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
        Assert.ThrowsAsync<DataNotFoundException>(() =>
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
        Assert.ThrowsAsync<ForbiddenException>(() =>
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
        Assert.ThrowsAsync<DataNotFoundException>(() =>
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
        Assert.ThrowsAsync<DataNotFoundException>(() =>
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
        env.ConfigureTranslationBuild();

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
        TranslationBuild translationBuild = env.ConfigureTranslationBuild();

        // SUT
        ServalBuildDto? actual = await env.Service.GetCurrentBuildAsync(
            User01,
            Project01,
            minRevision: null,
            preTranslate: false,
            isServalAdmin: false,
            CancellationToken.None
        );

        TestEnvironment.AssertCoreBuildProperties(translationBuild, actual);
        Assert.NotNull(actual.AdditionalInfo);
        Assert.AreEqual(
            new ProjectScriptureRange { ScriptureRange = "GEN" },
            actual.AdditionalInfo.TranslationScriptureRanges.Single()
        );
        Assert.AreEqual(
            new ProjectScriptureRange { ScriptureRange = "EXO" },
            actual.AdditionalInfo.TrainingScriptureRanges.Single()
        );
    }

    [Test]
    public async Task GetCurrentBuildAsync_PreTranslationCompleted()
    {
        // Set up test environment
        var env = new TestEnvironment();
        TranslationBuild translationBuild = env.ConfigureTranslationBuild();
        env.TranslationEnginesClient.GetCurrentBuildAsync(
                TranslationEngine01,
                minRevision: null,
                CancellationToken.None
            )
            .Throws(ServalApiExceptions.NoContent);

        // SUT
        ServalBuildDto? actual = await env.Service.GetCurrentBuildAsync(
            User01,
            Project01,
            minRevision: null,
            preTranslate: true,
            isServalAdmin: false,
            CancellationToken.None
        );

        TestEnvironment.AssertCoreBuildProperties(translationBuild, actual);
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
        Assert.ThrowsAsync<DataNotFoundException>(() =>
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
        Assert.ThrowsAsync<ForbiddenException>(() =>
            env.Service.GetEngineAsync(User02, Project01, CancellationToken.None)
        );
    }

    [Test]
    public void GetEngineAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.GetEngineAsync(User01, "invalid_project_id", CancellationToken.None)
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
        Assert.ThrowsAsync<ForbiddenException>(() =>
            env.Service.GetEngineAsync(User01, Project01, CancellationToken.None)
        );
    }

    [Test]
    public void GetEngineAsync_NoTranslationEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.GetEngineAsync(User01, Project03, CancellationToken.None)
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
        Assert.ThrowsAsync<BrokenCircuitException>(() =>
            env.Service.GetEngineAsync(User01, Project01, CancellationToken.None)
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

        // Create a failed translation build
        TranslationBuild translationBuild = new TranslationBuild
        {
            Url = "https://example.com",
            Id = Build01,
            Engine = { Id = "engineId", Url = "https://example.com" },
            Message = string.Empty,
            Progress = 0,
            Revision = 0,
            State = JobState.Faulted,
        };
        env.ConfigureTranslationBuild(translationBuild);

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
        Assert.ThrowsAsync<ForbiddenException>(() =>
            env.Service.GetLastCompletedPreTranslationBuildAsync(User02, Project01, false, CancellationToken.None)
        );
    }

    [Test]
    public void GetLastCompletedPreTranslationBuildAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
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
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.GetLastCompletedPreTranslationBuildAsync(User01, Project03, false, CancellationToken.None)
        );
    }

    [Test]
    public void GetLastCompletedPreTranslationBuildAsync_ServalOutage()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient.GetAllBuildsAsync(TranslationEngine01).Throws(new BrokenCircuitException());

        // SUT
        Assert.ThrowsAsync<BrokenCircuitException>(() =>
            env.Service.GetLastCompletedPreTranslationBuildAsync(User01, Project01, false, CancellationToken.None)
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
    public async Task GetLastCompletedPreTranslationBuildAsync_RetrievePreTranslationStatusAsyncCall_Success()
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
                            Progress = percentCompleted,
                            Revision = revision,
                            State = state,
                            DateFinished = DateTimeOffset.UtcNow,
                            Pretranslate =
                            [
                                new PretranslateCorpus
                                {
                                    ParallelCorpus = new ResourceLink
                                    {
                                        Id = ParallelCorpusId01,
                                        Url = "https://example.com",
                                    },
                                    SourceFilters =
                                    [
                                        new ParallelCorpusFilter
                                        {
                                            Corpus = { Id = ParallelCorpusId01, Url = "https://example.com" },
                                            ScriptureRange = "GEN",
                                        },
                                    ],
                                },
                            ],
                        },
                    ]
                )
            );
        SFProject project = env.Projects.Get(Project01);
        project.Texts[0].Chapters[1].HasDraft = true;

        // SUT
        ServalBuildDto? actual = await env.Service.GetLastCompletedPreTranslationBuildAsync(
            User01,
            Project01,
            false,
            CancellationToken.None
        );

        // Verify that a job was scheduled and the correct build was returned
        env.BackgroundJobClient.Received(1).Create(Arg.Any<Job>(), Arg.Any<IState>());
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
    public async Task GetLastCompletedPreTranslationBuildAsync_NoRetrievePreTranslationStatusAsyncCall_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
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
                            Progress = percentCompleted,
                            Revision = revision,
                            State = state,
                            DateFinished = DateTimeOffset.UtcNow,
                            Pretranslate =
                            [
                                new PretranslateCorpus
                                {
                                    SourceFilters =
                                    [
                                        new ParallelCorpusFilter
                                        {
                                            Corpus = new ResourceLink { Id = "corpusId", Url = "https://example.com" },
                                            ScriptureRange = "GEN",
                                        },
                                    ],
                                },
                            ],
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

        await env.Service.DidNotReceive().RetrievePreTranslationStatusAsync(Project01, CancellationToken.None);

        TestEnvironment.AssertCoreBuildProperties(CompletedTranslationBuild, actual);
    }

    [Test]
    public async Task GetLastCompletedPreTranslationBuildAsync_NullScriptureRange_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
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
                            Progress = percentCompleted,
                            Revision = revision,
                            State = state,
                            DateFinished = DateTimeOffset.UtcNow,
                            Pretranslate =
                            [
                                new PretranslateCorpus
                                {
                                    SourceFilters =
                                    [
                                        new ParallelCorpusFilter
                                        {
                                            Corpus = new ResourceLink { Id = "corpusId", Url = "https://example.com" },
                                            ScriptureRange = null,
                                        },
                                    ],
                                },
                            ],
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

        await env.Service.DidNotReceive().RetrievePreTranslationStatusAsync(Project01, CancellationToken.None);

        TestEnvironment.AssertCoreBuildProperties(CompletedTranslationBuild, actual);
    }

    [Test]
    public void GetPreTranslationAsync_EngineNotBuilt()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.PreTranslationService.GetPreTranslationsAsync(Project01, 40, 1, CancellationToken.None)
            .Throws(ServalApiExceptions.EngineNotBuilt);

        // SUT
        Assert.ThrowsAsync<InvalidOperationException>(() =>
            env.Service.GetPreTranslationAsync(User01, Project01, 40, 1, CancellationToken.None)
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
        Assert.ThrowsAsync<ForbiddenException>(() =>
            env.Service.GetPreTranslationAsync(User01, Project01, 40, 1, CancellationToken.None)
        );
    }

    [Test]
    public void GetPreTranslationAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(() =>
            env.Service.GetPreTranslationAsync(User02, Project01, 40, 1, CancellationToken.None)
        );
    }

    [Test]
    public void GetPreTranslationAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.GetPreTranslationAsync(User01, "invalid_project_id", 40, 1, CancellationToken.None)
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
        Assert.ThrowsAsync<BrokenCircuitException>(() =>
            env.Service.GetPreTranslationAsync(User01, Project01, 40, 1, CancellationToken.None)
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
                        new PreTranslation { Reference = reference, Translation = translation },
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
        env.PreTranslationService.GetPreTranslationUsfmAsync(
                Project01,
                40,
                1,
                Arg.Any<DraftUsfmConfig>(),
                CancellationToken.None
            )
            .Throws(ServalApiExceptions.InvalidCorpus);

        // SUT
        Assert.ThrowsAsync<NotSupportedException>(() =>
            env.Service.GetPreTranslationDeltaAsync(
                User01,
                Project01,
                40,
                1,
                false,
                DateTime.UtcNow,
                null,
                CancellationToken.None
            )
        );
    }

    [Test]
    public void GetPreTranslationDeltaAsync_ChapterNotSpecified()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.GetPreTranslationDeltaAsync(
                User01,
                Project01,
                40,
                0,
                false,
                DateTime.UtcNow,
                null,
                CancellationToken.None
            )
        );
    }

    [Test]
    public async Task GetPreTranslationDeltaAsync_ServalAdminDoesNotNeedPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();
        JToken token = JToken.Parse("{\"insert\": { \"chapter\": { \"number\": \"1\", \"style\": \"c\" } } }");
        Delta expected = new Delta([token]);
        env.DeltaUsxMapper.ToChapterDeltas(Arg.Any<XDocument>()).Returns([new ChapterDelta(1, 1, true, expected)]);

        // SUT
        Snapshot<TextData> actual = await env.Service.GetPreTranslationDeltaAsync(
            User02,
            Project01,
            40,
            1,
            true,
            DateTime.UtcNow,
            null,
            CancellationToken.None
        );
        Assert.AreEqual(expected.Ops[0], actual.Data.Ops[0]);
        Assert.AreEqual(TextData.GetTextDocId(Project01, "MAT", 1), actual.Id);
    }

    [Test]
    public async Task GetPreTranslationDeltaAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        JToken token = JToken.Parse("{\"insert\": { \"chapter\": { \"number\": \"1\", \"style\": \"c\" } } }");
        Delta expected = new Delta([token]);
        env.DeltaUsxMapper.ToChapterDeltas(Arg.Any<XDocument>()).Returns([new ChapterDelta(1, 1, true, expected)]);

        // SUT
        Snapshot<TextData> actual = await env.Service.GetPreTranslationDeltaAsync(
            User01,
            Project01,
            40,
            1,
            false,
            DateTime.UtcNow,
            null,
            CancellationToken.None
        );
        Assert.AreEqual(expected.Ops[0], actual.Data.Ops[0]);
        Assert.AreEqual(TextData.GetTextDocId(Project01, "MAT", 1), actual.Id);
    }

    [Test]
    public async Task GetPreTranslationDeltaAsync_SuccessSpecificConfig()
    {
        // Set up test environment
        var env = new TestEnvironment();
        JToken token = JToken.Parse("{\"insert\": { \"chapter\": { \"number\": \"1\", \"style\": \"c\" } } }");
        Delta expected = new Delta([token]);
        env.DeltaUsxMapper.ToChapterDeltas(Arg.Any<XDocument>()).Returns([new ChapterDelta(1, 1, true, expected)]);
        DraftUsfmConfig config = new DraftUsfmConfig { ParagraphFormat = ParagraphBreakFormatOptions.Remove };

        // SUT
        Snapshot<TextData> actual = await env.Service.GetPreTranslationDeltaAsync(
            User01,
            Project01,
            40,
            1,
            false,
            DateTime.UtcNow,
            config,
            CancellationToken.None
        );
        Assert.AreEqual(expected.Ops[0], actual.Data.Ops[0]);
        Assert.AreEqual(TextData.GetTextDocId(Project01, "MAT", 1), actual.Id);
        Attempt<TextDocument> attempt = await env.RealtimeService.GetRepository<TextDocument>().TryGetAsync(actual.Id);
        Assert.False(attempt.Success);
        await env
            .PreTranslationService.Received(1)
            .GetPreTranslationUsfmAsync(
                Project01,
                40,
                1,
                Arg.Is<DraftUsfmConfig>(d => d.ParagraphFormat == config.ParagraphFormat),
                CancellationToken.None
            );
    }

    [Test]
    public async Task GetPreTranslationDeltaAsync_CancelEnumeration()
    {
        // Set up test environment
        var env = new TestEnvironment();
        JToken token = JToken.Parse("{\"insert\": { \"chapter\": { \"number\": \"1\", \"style\": \"c\" } } }");
        Delta expected = new Delta([token]);
        env.DeltaUsxMapper.ToChapterDeltas(Arg.Any<XDocument>()).Returns([new ChapterDelta(1, 1, true, expected)]);
        DraftUsfmConfig config = new DraftUsfmConfig { ParagraphFormat = ParagraphBreakFormatOptions.Remove };

        // SUT
        Snapshot<TextData> actual = await env.Service.GetPreTranslationDeltaAsync(
            User01,
            Project01,
            40,
            1,
            false,
            DateTime.UtcNow,
            config,
            CancellationToken.None
        );
        Assert.AreEqual(expected.Ops[0], actual.Data.Ops[0]);
        Assert.AreEqual(TextData.GetTextDocId(Project01, "MAT", 1), actual.Id);
        Attempt<TextDocument> attempt = await env.RealtimeService.GetRepository<TextDocument>().TryGetAsync(actual.Id);
        Assert.False(attempt.Success);
        await env
            .PreTranslationService.Received(1)
            .GetPreTranslationUsfmAsync(
                Project01,
                40,
                1,
                Arg.Is<DraftUsfmConfig>(d => d.ParagraphFormat == config.ParagraphFormat),
                CancellationToken.None
            );
    }

    [Test]
    public async Task GetPreTranslationRevisionsAsync_NoOps()
    {
        // Set up test environment
        var env = new TestEnvironment();
        DateTimeOffset dateFinished = DateTimeOffset.UtcNow;
        env.TranslationEnginesClient.GetAllBuildsAsync(TranslationEngine01, CancellationToken.None)
            .Returns(
                Task.FromResult<IList<TranslationBuild>>(
                    [
                        new TranslationBuild
                        {
                            Url = "https://example.com",
                            Id = Build01,
                            Engine = new ResourceLink { Id = "engineId", Url = "https://example.com" },
                            Message = "Completed",
                            Progress = 0,
                            Revision = 43,
                            State = JobState.Completed,
                            DateFinished = dateFinished,
                            Pretranslate =
                            [
                                new PretranslateCorpus
                                {
                                    SourceFilters =
                                    [
                                        new ParallelCorpusFilter
                                        {
                                            Corpus = new ResourceLink { Id = "corpusId", Url = "https://example.com" },
                                            ScriptureRange = "GEN",
                                        },
                                    ],
                                },
                            ],
                        },
                    ]
                )
            );

        // SUT
        IReadOnlyList<DocumentRevision> revisions = await env.Service.GetPreTranslationRevisionsAsync(
            User01,
            Project01,
            40,
            1,
            isServalAdmin: false,
            CancellationToken.None
        );

        Assert.AreEqual(1, revisions.Count);
        Assert.AreEqual(revisions[0].Source, OpSource.Draft);
        Assert.AreEqual(revisions[0].Timestamp, dateFinished.UtcDateTime);
        Assert.IsNull(revisions[0].UserId);
    }

    [Test]
    public async Task GetPreTranslationRevisionsAsync_NoOpsOrBuildOnServal()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        IReadOnlyList<DocumentRevision> revisions = await env.Service.GetPreTranslationRevisionsAsync(
            User01,
            Project01,
            40,
            1,
            isServalAdmin: false,
            CancellationToken.None
        );

        Assert.IsEmpty(revisions);
    }

    [Test]
    public async Task GetPreTranslationRevisionsAsync_ServalAdminDoesNotNeedPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();
        string textDocumentId = TextDocument.GetDocId(Project01, 40, 1, TextDocument.Draft);
        env.SetupTextDocument(textDocumentId, 40, alreadyExists: true);

        // SUT
        IReadOnlyList<DocumentRevision> revisions = await env.Service.GetPreTranslationRevisionsAsync(
            User01,
            Project01,
            40,
            1,
            isServalAdmin: false,
            CancellationToken.None
        );

        Assert.AreEqual(2, revisions.Count);
    }

    [Test]
    public async Task GetPreTranslationRevisionsAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        string textDocumentId = TextDocument.GetDocId(Project01, 40, 1, TextDocument.Draft);
        env.SetupTextDocument(textDocumentId, 40, alreadyExists: true);

        // SUT
        IReadOnlyList<DocumentRevision> revisions = await env.Service.GetPreTranslationRevisionsAsync(
            User01,
            Project01,
            40,
            1,
            isServalAdmin: false,
            CancellationToken.None
        );

        Assert.AreEqual(2, revisions.Count);
    }

    [Test]
    public void GetPreTranslationUsfmAsync_CorpusDoesNotSupportUsfm()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.PreTranslationService.GetPreTranslationUsfmAsync(
                Project01,
                40,
                1,
                Arg.Any<DraftUsfmConfig>(),
                CancellationToken.None
            )
            .Throws(ServalApiExceptions.InvalidCorpus);

        // SUT
        Assert.ThrowsAsync<NotSupportedException>(() =>
            env.Service.GetPreTranslationUsfmAsync(
                User01,
                Project01,
                40,
                1,
                false,
                DateTime.UtcNow,
                null,
                CancellationToken.None
            )
        );
    }

    [Test]
    public async Task GetPreTranslationUsfmAsync_MissingUserSecret()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.UserSecrets.DeleteAllAsync(_ => true);

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.GetPreTranslationUsfmAsync(
                User01,
                Project01,
                40,
                1,
                false,
                DateTime.UtcNow,
                null,
                CancellationToken.None
            )
        );
    }

    [Test]
    public async Task GetPreTranslationUsfmAsync_ServalAdminDoesNotNeedPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string expected = "\\c 1 \\v1 Verse 1";
        env.ParatextService.ConvertUsxToUsfm(Arg.Any<UserSecret>(), Arg.Any<string>(), 40, Arg.Any<XDocument>())
            .Returns(expected);

        // SUT
        string usfm = await env.Service.GetPreTranslationUsfmAsync(
            User02,
            Project01,
            40,
            1,
            true,
            DateTime.UtcNow,
            null,
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
        env.ParatextService.ConvertUsxToUsfm(Arg.Any<UserSecret>(), Arg.Any<string>(), 40, Arg.Any<XDocument>())
            .Returns(expected);

        // SUT
        string usfm = await env.Service.GetPreTranslationUsfmAsync(
            User01,
            Project01,
            40,
            1,
            false,
            DateTime.UtcNow,
            null,
            CancellationToken.None
        );
        Assert.AreEqual(expected, usfm);
    }

    [Test]
    public async Task GetPreTranslationUsfmAsync_SuccessSpecificConfig()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string expected = "\\c 1 \\v1 Verse 1";
        env.ParatextService.ConvertUsxToUsfm(Arg.Any<UserSecret>(), Arg.Any<string>(), 40, Arg.Any<XDocument>())
            .Returns(expected);

        var config = new DraftUsfmConfig
        {
            ParagraphFormat = ParagraphBreakFormatOptions.Remove,
            QuoteFormat = QuoteStyleOptions.Normalized,
        };

        // SUT
        string usfm = await env.Service.GetPreTranslationUsfmAsync(
            User01,
            Project01,
            40,
            1,
            false,
            DateTime.UtcNow,
            config,
            CancellationToken.None
        );
        Assert.AreEqual(expected, usfm);
        await env
            .PreTranslationService.Received(1)
            .GetPreTranslationUsfmAsync(
                Project01,
                40,
                1,
                Arg.Is<DraftUsfmConfig>(d =>
                    d.ParagraphFormat == config.ParagraphFormat && d.QuoteFormat == config.QuoteFormat
                ),
                CancellationToken.None
            );
    }

    [Test]
    public void GetPreTranslationUsjAsync_CorpusDoesNotSupportUsfm()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.PreTranslationService.GetPreTranslationUsfmAsync(
                Project01,
                40,
                1,
                Arg.Any<DraftUsfmConfig>(),
                CancellationToken.None
            )
            .Throws(ServalApiExceptions.InvalidCorpus);

        // SUT
        Assert.ThrowsAsync<NotSupportedException>(() =>
            env.Service.GetPreTranslationUsjAsync(
                User01,
                Project01,
                40,
                1,
                false,
                DateTime.UtcNow,
                null,
                CancellationToken.None
            )
        );
    }

    [Test]
    public async Task GetPreTranslationUsjAsync_DoesNotSaveIfChapterZero()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.PreTranslationService.GetPreTranslationUsfmAsync(
                Project01,
                40,
                0,
                Arg.Any<DraftUsfmConfig>(),
                CancellationToken.None
            )
            .Returns(Task.FromResult(TestUsfm));
        env.ParatextService.GetBookText(Arg.Any<UserSecret>(), Arg.Any<string>(), 40, TestUsfm).Returns(TestUsx);

        // SUT
        IUsj actual = await env.Service.GetPreTranslationUsjAsync(
            User01,
            Project01,
            40,
            0,
            false,
            DateTime.UtcNow,
            null,
            CancellationToken.None
        );
        Assert.That(actual, Is.EqualTo(TestUsj).UsingPropertiesComparer());

        // Ensure that no document was saved
        long count = await env.TextDocuments.CountDocumentsAsync(_ => true);
        Assert.That(count, Is.Zero);
    }

    [Test]
    public async Task GetPreTranslationUsjAsync_DoesNotSaveIfSpecificConfig()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var config = new DraftUsfmConfig { ParagraphFormat = ParagraphBreakFormatOptions.MoveToEnd };
        env.PreTranslationService.GetPreTranslationUsfmAsync(
                Project01,
                40,
                1,
                Arg.Any<DraftUsfmConfig>(),
                CancellationToken.None
            )
            .Returns(Task.FromResult(TestUsfm));
        env.ParatextService.GetBookText(Arg.Any<UserSecret>(), Arg.Any<string>(), 40, TestUsfm).Returns(TestUsx);

        // SUT
        IUsj actual = await env.Service.GetPreTranslationUsjAsync(
            User01,
            Project01,
            40,
            1,
            false,
            DateTime.UtcNow,
            config,
            CancellationToken.None
        );
        Assert.That(actual, Is.EqualTo(TestUsj).UsingPropertiesComparer());

        // Ensure that no document was saved
        long count = await env.TextDocuments.CountDocumentsAsync(_ => true);
        Assert.That(count, Is.Zero);
    }

    [Test]
    public async Task GetPreTranslationUsjAsync_MissingUserSecret()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.UserSecrets.DeleteAllAsync(_ => true);

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.GetPreTranslationUsjAsync(
                User01,
                Project01,
                40,
                1,
                false,
                DateTime.UtcNow,
                null,
                CancellationToken.None
            )
        );
    }

    [Test]
    public void GetPreTranslationUsjAsync_NoSnapshotAtTimestamp()
    {
        // Set up test environment
        var env = new TestEnvironment();
        string id = TextDocument.GetDocId(Project01, 40, 1, TextDocument.Draft);
        env.TextDocuments.Add(new TextDocument(id, TestUsj));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.GetPreTranslationUsjAsync(
                User01,
                Project01,
                40,
                1,
                false,
                DateTime.MinValue,
                null,
                CancellationToken.None
            )
        );
    }

    [Test]
    public async Task GetPreTranslationUsjAsync_RetrievesFromServalIfNoLocalCopy()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.PreTranslationService.GetPreTranslationUsfmAsync(
                Project01,
                40,
                1,
                Arg.Any<DraftUsfmConfig>(),
                CancellationToken.None
            )
            .Returns(Task.FromResult(TestUsfm));
        env.ParatextService.GetBookText(Arg.Any<UserSecret>(), Arg.Any<string>(), 40, TestUsfm).Returns(TestUsx);

        // SUT
        IUsj actual = await env.Service.GetPreTranslationUsjAsync(
            User01,
            Project01,
            40,
            1,
            false,
            DateTime.UtcNow,
            null,
            CancellationToken.None
        );
        Assert.That(actual, Is.EqualTo(TestUsj).UsingPropertiesComparer());

        // See if a document was saved
        long count = await env.TextDocuments.CountDocumentsAsync(_ => true);
        Assert.That(count, Is.Not.Zero);
    }

    [Test]
    public async Task GetPreTranslationUsjAsync_ServalAdminDoesNotNeedPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.PreTranslationService.GetPreTranslationUsfmAsync(
                Project01,
                40,
                1,
                Arg.Any<DraftUsfmConfig>(),
                CancellationToken.None
            )
            .Returns(Task.FromResult(TestUsfm));
        env.ParatextService.GetBookText(Arg.Any<UserSecret>(), Arg.Any<string>(), 40, TestUsfm).Returns(TestUsx);

        // SUT
        IUsj actual = await env.Service.GetPreTranslationUsjAsync(
            User02,
            Project01,
            40,
            1,
            true,
            DateTime.UtcNow,
            null,
            CancellationToken.None
        );
        Assert.That(actual, Is.EqualTo(TestUsj).UsingPropertiesComparer());
    }

    [Test]
    public async Task GetPreTranslationUsjAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        string id = TextDocument.GetDocId(Project01, 40, 1, TextDocument.Draft);
        env.TextDocuments.Add(new TextDocument(id, TestUsj));

        // SUT
        IUsj actual = await env.Service.GetPreTranslationUsjAsync(
            User01,
            Project01,
            40,
            1,
            false,
            DateTime.UtcNow,
            null,
            CancellationToken.None
        );

        // We compare to a TextDocument, as that is what is returned underneath the IUsj interface
        Assert.That(actual, Is.EqualTo(new TextDocument(id, TestUsj)).UsingPropertiesComparer());
    }

    [Test]
    public async Task GetPreTranslationUsjAsync_SuccessSpecificConfig()
    {
        // Set up test environment
        var env = new TestEnvironment();
        string id = TextDocument.GetDocId(Project01, 40, 1, TextDocument.Draft);
        env.PreTranslationService.GetPreTranslationUsfmAsync(
                Project01,
                40,
                1,
                Arg.Any<DraftUsfmConfig>(),
                CancellationToken.None
            )
            .Returns(Task.FromResult(TestUsfm));
        env.ParatextService.GetBookText(Arg.Any<UserSecret>(), Paratext01, 40, TestUsfm).Returns(TestUsx);
        Usj usj = new Usj
        {
            Type = Usj.UsjType,
            Version = Usj.UsjVersion,
            Content =
            [
                new UsjMarker
                {
                    Type = "book",
                    Marker = "id",
                    Code = "MAT",
                },
                new UsjMarker
                {
                    Type = "chapter",
                    Marker = "c",
                    Number = "2",
                },
                new UsjMarker
                {
                    Type = "verse",
                    Marker = "v",
                    Number = "1",
                },
                "Original usj content",
            ],
        };
        // Add a default document snapshot
        env.TextDocuments.Add(new TextDocument(id, usj));
        var config = new DraftUsfmConfig { ParagraphFormat = ParagraphBreakFormatOptions.Remove };

        // SUT
        IUsj actual = await env.Service.GetPreTranslationUsjAsync(
            User01,
            Project01,
            40,
            1,
            false,
            DateTime.UtcNow,
            config,
            CancellationToken.None
        );

        Assert.That(actual, Is.EqualTo(TestUsj).UsingPropertiesComparer());

        await env
            .PreTranslationService.Received(1)
            .GetPreTranslationUsfmAsync(
                Project01,
                40,
                1,
                Arg.Is<DraftUsfmConfig>(d => d.ParagraphFormat == config.ParagraphFormat),
                CancellationToken.None
            );
    }

    [Test]
    public void GetPreTranslationUsxAsync_CorpusDoesNotSupportUsfm()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.PreTranslationService.GetPreTranslationUsfmAsync(
                Project01,
                40,
                1,
                Arg.Any<DraftUsfmConfig>(),
                CancellationToken.None
            )
            .Throws(ServalApiExceptions.InvalidCorpus);

        // SUT
        Assert.ThrowsAsync<NotSupportedException>(() =>
            env.Service.GetPreTranslationUsxAsync(
                User01,
                Project01,
                40,
                1,
                false,
                DateTime.UtcNow,
                null,
                CancellationToken.None
            )
        );
    }

    [Test]
    public async Task GetPreTranslationUsxAsync_MissingUserSecret()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.UserSecrets.DeleteAllAsync(_ => true);

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.GetPreTranslationUsxAsync(
                User01,
                Project01,
                40,
                1,
                false,
                DateTime.UtcNow,
                null,
                CancellationToken.None
            )
        );
    }

    [Test]
    public async Task GetPreTranslationUsxAsync_ServalAdminDoesNotNeedPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string usfm = "\\c 1 \\v1 Verse 1";
        const string usx =
            "<usx version=\"3.0\"><book code=\"MAT\" style=\"id\"></book><chapter number=\"1\" style=\"c\" />"
            + "<verse number=\"1\" style=\"v\" />Verse 1</usx>";
        env.PreTranslationService.GetPreTranslationUsfmAsync(
                Project01,
                40,
                1,
                Arg.Any<DraftUsfmConfig>(),
                CancellationToken.None
            )
            .Returns(Task.FromResult(usfm));
        env.ParatextService.GetBookText(Arg.Any<UserSecret>(), Arg.Any<string>(), 40, usfm).Returns(usx);
        string expected = UsjToUsx.UsjToUsxString(TestUsj);

        // SUT
        string actual = await env.Service.GetPreTranslationUsxAsync(
            User02,
            Project01,
            40,
            1,
            true,
            DateTime.UtcNow,
            null,
            CancellationToken.None
        );
        Assert.AreEqual(expected, actual);
    }

    [Test]
    public async Task GetPreTranslationUsxAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string usfm = "\\c 1 \\v1 Verse 1";
        const string usx =
            "<usx version=\"3.0\"><book code=\"MAT\" style=\"id\"></book><chapter number=\"1\" style=\"c\" />"
            + "<verse number=\"1\" style=\"v\" />Verse 1</usx>";
        env.PreTranslationService.GetPreTranslationUsfmAsync(
                Project01,
                40,
                1,
                Arg.Any<DraftUsfmConfig>(),
                CancellationToken.None
            )
            .Returns(Task.FromResult(usfm));
        env.ParatextService.GetBookText(Arg.Any<UserSecret>(), Arg.Any<string>(), 40, usfm).Returns(usx);
        string expected = UsjToUsx.UsjToUsxString(TestUsj);

        // SUT
        string actual = await env.Service.GetPreTranslationUsxAsync(
            User01,
            Project01,
            40,
            1,
            false,
            DateTime.UtcNow,
            null,
            CancellationToken.None
        );
        Assert.AreEqual(expected, actual);
    }

    [Test]
    public async Task GetPreTranslationUsxAsync_SuccessSpecificConfig()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string usfm = "\\c 1 \\v1 Verse 1";
        const string usx =
            "<usx version=\"3.0\"><book code=\"MAT\" style=\"id\"></book><chapter number=\"1\" style=\"c\" />"
            + "<verse number=\"1\" style=\"v\" />Verse 1</usx>";
        env.PreTranslationService.GetPreTranslationUsfmAsync(
                Project01,
                40,
                1,
                Arg.Any<DraftUsfmConfig>(),
                CancellationToken.None
            )
            .Returns(Task.FromResult(usfm));
        env.ParatextService.GetBookText(Arg.Any<UserSecret>(), Arg.Any<string>(), 40, usfm).Returns(usx);
        string expected = UsjToUsx.UsjToUsxString(TestUsj);
        var config = new DraftUsfmConfig { ParagraphFormat = ParagraphBreakFormatOptions.Remove };

        // SUT
        string actual = await env.Service.GetPreTranslationUsxAsync(
            User01,
            Project01,
            40,
            1,
            false,
            DateTime.UtcNow,
            config,
            CancellationToken.None
        );
        Assert.AreEqual(expected, actual);
        await env
            .PreTranslationService.Received(1)
            .GetPreTranslationUsfmAsync(
                Project01,
                40,
                1,
                Arg.Is<DraftUsfmConfig>(d => d.ParagraphFormat == config.ParagraphFormat),
                CancellationToken.None
            );
    }

    [Test]
    public void GetWordGraphAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(() =>
            env.Service.GetWordGraphAsync(User02, Project01, Segment, CancellationToken.None)
        );
    }

    [Test]
    public void GetWordGraphAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.GetWordGraphAsync(User01, "invalid_project_id", Segment, CancellationToken.None)
        );
    }

    [Test]
    public void GetWordGraphAsync_NoTranslationEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.GetWordGraphAsync(User01, Project03, Segment, CancellationToken.None)
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
        Assert.ThrowsAsync<BrokenCircuitException>(() =>
            env.Service.GetWordGraphAsync(User01, Project01, Segment, CancellationToken.None)
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
        Assert.ThrowsAsync<InvalidOperationException>(() =>
            env.Service.GetWordGraphAsync(User01, Project01, Segment, CancellationToken.None)
        );
    }

    [Test]
    public async Task GetQueuedStateAsync_BuildCrashed()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string errorMessage = "This is an error message from Serval";
        await env.QueueBuildAsync(Project01, preTranslate: false, DateTime.UtcNow.AddHours(-6), errorMessage);

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
        await env.QueueBuildAsync(Project01, preTranslate: false, DateTime.UtcNow.AddHours(-6));

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
        await env.QueueBuildAsync(Project01, preTranslate: false, dateTime: DateTime.UtcNow);

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
        await env.QueueBuildAsync(Project01, preTranslate: true, DateTime.UtcNow.AddHours(-6), errorMessage);

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
        await env.QueueBuildAsync(Project01, preTranslate: true, DateTime.UtcNow.AddHours(-6));

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
    public async Task GetQueuedStateAsync_PreTranslationBuildQueuedWithScriptureRange()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.QueueBuildAsync(Project01, preTranslate: true, dateTime: DateTime.UtcNow);

        // SUT
        ServalBuildDto? actual = await env.Service.GetQueuedStateAsync(
            User01,
            Project01,
            preTranslate: true,
            isServalAdmin: false,
            CancellationToken.None
        );
        Assert.AreEqual(MachineApiService.BuildStateQueued, actual?.State);
        Assert.NotNull(actual?.AdditionalInfo);
        Assert.AreEqual(
            new ProjectScriptureRange { ScriptureRange = "GEN" },
            actual?.AdditionalInfo?.TranslationScriptureRanges.Single()
        );
        Assert.AreEqual(
            new ProjectScriptureRange { ScriptureRange = "EXO" },
            actual?.AdditionalInfo?.TrainingScriptureRanges.Single()
        );
    }

    [Test]
    public async Task GetQueuedStateAsync_PreTranslationBuildQueuedWithScriptureRanges()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.QueueBuildAsync(Project02, preTranslate: true, dateTime: DateTime.UtcNow);

        // SUT
        ServalBuildDto? actual = await env.Service.GetQueuedStateAsync(
            User01,
            Project02,
            preTranslate: true,
            isServalAdmin: false,
            CancellationToken.None
        );
        Assert.AreEqual(MachineApiService.BuildStateQueued, actual?.State);
        Assert.NotNull(actual?.AdditionalInfo);
        Assert.AreEqual(
            new ProjectScriptureRange { ProjectId = Project03, ScriptureRange = "GEN" },
            actual?.AdditionalInfo?.TranslationScriptureRanges.Single()
        );
        Assert.AreEqual(
            new ProjectScriptureRange { ProjectId = Project03, ScriptureRange = "EXO" },
            actual?.AdditionalInfo?.TrainingScriptureRanges.Single()
        );
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
        Assert.ThrowsAsync<ForbiddenException>(() =>
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
    public async Task GetQueuedStateAsync_WebhookRunning()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.QueueBuildAsync(
            Project01,
            preTranslate: true,
            dateTime: null,
            errorMessage: null,
            preTranslationsRetrieved: false
        );

        // SUT
        ServalBuildDto? actual = await env.Service.GetQueuedStateAsync(
            User01,
            Project01,
            preTranslate: true,
            isServalAdmin: false,
            CancellationToken.None
        );
        Assert.AreEqual(MachineApiService.BuildStateFinishing, actual?.State);
        Assert.IsFalse(string.IsNullOrWhiteSpace(actual?.Message));
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
    public void RetrievePreTranslationStatusAsync_ReportsErrors()
    {
        // Set up test environment
        var env = new TestEnvironment();
        ServalApiException ex = ServalApiExceptions.Forbidden;
        env.PreTranslationService.UpdatePreTranslationStatusAsync(Project01, CancellationToken.None).Throws(ex);

        // SUT
        Assert.ThrowsAsync<ServalApiException>(() =>
            env.Service.RetrievePreTranslationStatusAsync(Project01, CancellationToken.None)
        );

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
    public async Task RetrievePreTranslationStatusAsync_UpdatesPreTranslationStatusAndTextDocuments()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.Service.Configure()
            .UpdatePreTranslationTextDocumentsAsync(Project01, CancellationToken.None)
            .Returns(Task.CompletedTask);

        // SUT
        await env.Service.RetrievePreTranslationStatusAsync(Project01, CancellationToken.None);

        await env.PreTranslationService.Received().UpdatePreTranslationStatusAsync(Project01, CancellationToken.None);
        await env.Service.Received().UpdatePreTranslationTextDocumentsAsync(Project01, CancellationToken.None);
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
                        IsNative = true,
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
        Assert.ThrowsAsync<ForbiddenException>(() =>
            env.Service.StartBuildAsync(User02, Project01, CancellationToken.None)
        );
    }

    [Test]
    public void StartBuildAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.StartBuildAsync(User01, "invalid_project_id", CancellationToken.None)
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
        Assert.ThrowsAsync<ForbiddenException>(() =>
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
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.StartPreTranslationBuildAsync(
                User01,
                new BuildConfig { ProjectId = "invalid_project_id" },
                CancellationToken.None
            )
        );
    }

    [Test]
    public async Task StartPreTranslationBuildAsync_SuccessNoTrainingOrTranslationScriptureRanges()
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
        Assert.IsEmpty(env.Projects.Get(Project01).TranslateConfig.DraftConfig.LastSelectedTrainingScriptureRanges);
        Assert.IsEmpty(env.Projects.Get(Project01).TranslateConfig.DraftConfig.LastSelectedTrainingDataFiles);
        Assert.IsEmpty(env.Projects.Get(Project01).TranslateConfig.DraftConfig.LastSelectedTranslationScriptureRanges);
    }

    [Test]
    public async Task StartPreTranslationBuildAsync_SuccessWithTrainingAndTranslationScriptureRanges()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string scriptureRange1 = "GEN";
        const string scriptureRange2 = "EXO";

        // SUT
        await env.Service.StartPreTranslationBuildAsync(
            User01,
            new BuildConfig
            {
                ProjectId = Project01,
                TrainingScriptureRanges =
                [
                    new ProjectScriptureRange { ProjectId = Project01, ScriptureRange = scriptureRange1 },
                ],
                TranslationScriptureRanges =
                [
                    new ProjectScriptureRange { ProjectId = Project02, ScriptureRange = scriptureRange2 },
                ],
                TrainingDataFiles = { Data01 },
            },
            CancellationToken.None
        );

        await env.ProjectService.Received(1).SyncAsync(User01, Project01);
        env.BackgroundJobClient.Received(1).Create(Arg.Any<Job>(), Arg.Any<IState>());
        Assert.AreEqual(JobId, env.ProjectSecrets.Get(Project01).ServalData!.PreTranslationJobId);
        Assert.IsNotNull(env.ProjectSecrets.Get(Project01).ServalData?.PreTranslationQueuedAt);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData?.PreTranslationErrorMessage);
        Assert.AreEqual(
            1,
            env.Projects.Get(Project01).TranslateConfig.DraftConfig.LastSelectedTrainingScriptureRanges.Count
        );
        Assert.AreEqual(
            Project01,
            env.Projects.Get(Project01)
                .TranslateConfig.DraftConfig.LastSelectedTrainingScriptureRanges.First()
                .ProjectId
        );
        Assert.AreEqual(
            scriptureRange1,
            env.Projects.Get(Project01)
                .TranslateConfig.DraftConfig.LastSelectedTrainingScriptureRanges.First()
                .ScriptureRange
        );
        Assert.AreEqual(
            1,
            env.Projects.Get(Project01).TranslateConfig.DraftConfig.LastSelectedTranslationScriptureRanges.Count
        );
        Assert.AreEqual(
            Project02,
            env.Projects.Get(Project01)
                .TranslateConfig.DraftConfig.LastSelectedTranslationScriptureRanges.First()
                .ProjectId
        );
        Assert.AreEqual(
            scriptureRange2,
            env.Projects.Get(Project01)
                .TranslateConfig.DraftConfig.LastSelectedTranslationScriptureRanges.First()
                .ScriptureRange
        );
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
    public async Task StartPreTranslationBuildAsync_SavesEchoAndFastTraining()
    {
        // Set up test environment
        var env = new TestEnvironment();
        SFProject project = env.Projects.Get(Project02);
        Assert.IsNull(project.TranslateConfig.DraftConfig.FastTraining);
        Assert.IsNull(project.TranslateConfig.DraftConfig.UseEcho);

        // SUT
        await env.Service.StartPreTranslationBuildAsync(
            User01,
            new BuildConfig
            {
                ProjectId = Project02,
                FastTraining = true,
                UseEcho = true,
            },
            CancellationToken.None
        );

        await env.SyncService.Received(1).SyncAsync(Arg.Any<SyncConfig>());
        env.BackgroundJobClient.Received(1).Create(Arg.Any<Job>(), Arg.Any<IState>());
        Assert.AreEqual(JobId, env.ProjectSecrets.Get(Project02).ServalData!.PreTranslationJobId);
        Assert.IsNotNull(env.ProjectSecrets.Get(Project02).ServalData?.PreTranslationQueuedAt);

        project = env.Projects.Get(Project02);
        Assert.IsTrue(project.TranslateConfig.DraftConfig.FastTraining);
        Assert.IsTrue(project.TranslateConfig.DraftConfig.UseEcho);
    }

    [Test]
    public async Task StartPreTranslationBuildAsync_SavesSendEmailOnBuildFinished()
    {
        // Set up test environment
        var env = new TestEnvironment();
        SFProject project = env.Projects.Get(Project02);
        Assert.IsNull(project.TranslateConfig.DraftConfig.SendEmailOnBuildFinished);

        // SUT
        await env.Service.StartPreTranslationBuildAsync(
            User01,
            new BuildConfig { ProjectId = Project02, SendEmailOnBuildFinished = true },
            CancellationToken.None
        );

        await env.SyncService.Received(1).SyncAsync(Arg.Any<SyncConfig>());
        env.BackgroundJobClient.Received(1).Create(Arg.Any<Job>(), Arg.Any<IState>());
        Assert.AreEqual(JobId, env.ProjectSecrets.Get(Project02).ServalData!.PreTranslationJobId);
        Assert.IsNotNull(env.ProjectSecrets.Get(Project02).ServalData?.PreTranslationQueuedAt);

        project = env.Projects.Get(Project02);
        Assert.IsTrue(project.TranslateConfig.DraftConfig.SendEmailOnBuildFinished);
    }

    [Test]
    public async Task StartPreTranslationBuildAsync_OnlySyncsEachProjectOnce()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.Projects.UpdateAsync(
            p => p.Id == Project02,
            u =>
                u.Set(
                    s => s.TranslateConfig,
                    new TranslateConfig
                    {
                        DraftConfig = new DraftConfig
                        {
                            AdditionalTrainingSourceEnabled = true,
                            AdditionalTrainingSource = new TranslateSource { ProjectRef = Project01 },
                            AlternateSourceEnabled = true,
                            AlternateSource = new TranslateSource { ProjectRef = Project01 },
                            AlternateTrainingSourceEnabled = true,
                            AlternateTrainingSource = new TranslateSource { ProjectRef = Project01 },
                        },
                    }
                )
        );

        // SUT
        await env.Service.StartPreTranslationBuildAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            CancellationToken.None
        );

        await env.ProjectService.Received(1).SyncAsync(User01, Project02);
        await env.SyncService.Received(1).SyncAsync(Arg.Any<SyncConfig>());
        env.BackgroundJobClient.Received(1).Create(Arg.Any<Job>(), Arg.Any<IState>());
        Assert.AreEqual(JobId, env.ProjectSecrets.Get(Project02).ServalData!.PreTranslationJobId);
        Assert.IsNotNull(env.ProjectSecrets.Get(Project02).ServalData?.PreTranslationQueuedAt);
        Assert.IsNull(env.ProjectSecrets.Get(Project02).ServalData?.PreTranslationErrorMessage);
    }

    [Test]
    public async Task StartPreTranslationBuildAsync_WillNotSyncSourceSeparatelyIfDuplicated()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.Projects.UpdateAsync(
            p => p.Id == Project02,
            u =>
                u.Set(
                    s => s.TranslateConfig,
                    new TranslateConfig
                    {
                        DraftConfig = new DraftConfig
                        {
                            AdditionalTrainingSourceEnabled = true,
                            AdditionalTrainingSource = new TranslateSource { ProjectRef = Project01 },
                            AlternateSourceEnabled = true,
                            AlternateSource = new TranslateSource { ProjectRef = Project01 },
                            AlternateTrainingSourceEnabled = true,
                            AlternateTrainingSource = new TranslateSource { ProjectRef = Project01 },
                        },
                        Source = new TranslateSource { ProjectRef = Project01 },
                    }
                )
        );

        // SUT
        await env.Service.StartPreTranslationBuildAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            CancellationToken.None
        );

        await env.ProjectService.Received(1).SyncAsync(User01, Project02);
        await env.SyncService.DidNotReceive().SyncAsync(Arg.Any<SyncConfig>());
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
        Assert.ThrowsAsync<ForbiddenException>(() =>
            env.Service.TrainSegmentAsync(User02, Project01, new SegmentPair(), CancellationToken.None)
        );
    }

    [Test]
    public void TrainSegmentAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.TrainSegmentAsync(User01, "invalid_project_id", new SegmentPair(), CancellationToken.None)
        );
    }

    [Test]
    public void TrainSegmentAsync_NoTranslationEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.TrainSegmentAsync(User01, Project03, new SegmentPair(), CancellationToken.None)
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
        Assert.ThrowsAsync<BrokenCircuitException>(() =>
            env.Service.TrainSegmentAsync(User01, Project01, new SegmentPair(), CancellationToken.None)
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
        Assert.ThrowsAsync<ForbiddenException>(() =>
            env.Service.TranslateAsync(User02, Project01, Segment, CancellationToken.None)
        );
    }

    [Test]
    public void TranslateAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.TranslateAsync(User01, "invalid_project_id", Segment, CancellationToken.None)
        );
    }

    [Test]
    public void TranslateAsync_NoTranslationEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.TranslateAsync(User01, Project03, Segment, CancellationToken.None)
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
        Assert.ThrowsAsync<BrokenCircuitException>(() =>
            env.Service.TranslateAsync(User01, Project01, Segment, CancellationToken.None)
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
        Assert.ThrowsAsync<ForbiddenException>(() =>
            env.Service.TranslateNAsync(User02, Project01, n, Segment, CancellationToken.None)
        );
    }

    [Test]
    public void TranslateNAsync_NoProject()
    {
        // Set up test environment
        const int n = 1;
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.TranslateNAsync(User01, "invalid_project_id", n, Segment, CancellationToken.None)
        );
    }

    [Test]
    public void TranslateNAsync_NoTranslationEngine()
    {
        // Set up test environment
        const int n = 1;
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.TranslateNAsync(User01, Project03, n, Segment, CancellationToken.None)
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
        Assert.ThrowsAsync<BrokenCircuitException>(() =>
            env.Service.TranslateNAsync(User01, Project01, n, Segment, CancellationToken.None)
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

    [Test]
    public async Task UpdatePreTranslationTextDocumentsAsync_CreatesNewDocument()
    {
        // Set up test environment
        var env = new TestEnvironment();
        string textDocumentId = TextDocument.GetDocId(Project01, 1, 1, TextDocument.Draft);
        const int bookNum = 1;
        env.SetupTextDocument(textDocumentId, bookNum, alreadyExists: false);

        // SUT
        await env.Service.UpdatePreTranslationTextDocumentsAsync(Project01, CancellationToken.None);

        await env
            .PreTranslationService.Received(1)
            .GetPreTranslationUsfmAsync(Project01, bookNum, 0, Arg.Any<DraftUsfmConfig>(), CancellationToken.None);
        env.ParatextService.Received(1).GetChaptersAsUsj(Arg.Any<UserSecret>(), Paratext01, bookNum, TestUsfm);
        Assert.AreEqual(1, await env.TextDocuments.CountDocumentsAsync(_ => true));
        Assert.IsNotEmpty(env.TextDocuments.Get(textDocumentId).Content!);
    }

    [Test]
    public async Task UpdatePreTranslationTextDocumentsAsync_NoProjectSecret()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.ProjectSecrets.DeleteAllAsync(_ => true);

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.UpdatePreTranslationTextDocumentsAsync(Project01, CancellationToken.None)
        );
    }

    [Test]
    public void UpdatePreTranslationTextDocumentsAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.UpdatePreTranslationTextDocumentsAsync("invalid_project_id", CancellationToken.None)
        );
    }

    [Test]
    public void UpdatePreTranslationTextDocumentsAsync_NoParallelCorpusId()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.UpdatePreTranslationTextDocumentsAsync(Project02, CancellationToken.None)
        );
    }

    [Test]
    public void UpdatePreTranslationTextDocumentsAsync_NoTranslationEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.UpdatePreTranslationTextDocumentsAsync(Project03, CancellationToken.None)
        );
    }

    [Test]
    public async Task UpdatePreTranslationTextDocumentsAsync_NoParatextUser()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.Projects.UpdateAsync(
            p => p.Id == Project01,
            u => u.Set(s => s.UserRoles, new Dictionary<string, string> { { User01, SFProjectRole.CommunityChecker } })
        );

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.UpdatePreTranslationTextDocumentsAsync(Project01, CancellationToken.None)
        );
    }

    [Test]
    public void UpdatePreTranslationTextDocumentsAsync_UserCannotCreateDrafts()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.ProjectRights.HasRight(Arg.Any<SFProject>(), User01, SFProjectDomain.Drafts, Operation.Create)
            .Returns(false);

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(() =>
            env.Service.UpdatePreTranslationTextDocumentsAsync(Project01, CancellationToken.None)
        );
    }

    [Test]
    public async Task UpdatePreTranslationTextDocumentsAsync_UpdatesExistingDocument()
    {
        // Set up test environment
        var env = new TestEnvironment();
        string textDocumentId = TextDocument.GetDocId(Project01, 1, 1, TextDocument.Draft);
        const int bookNum = 1;
        env.SetupTextDocument(textDocumentId, bookNum, alreadyExists: true);

        // SUT
        await env.Service.UpdatePreTranslationTextDocumentsAsync(Project01, CancellationToken.None);

        await env
            .PreTranslationService.Received(1)
            .GetPreTranslationUsfmAsync(Project01, bookNum, 0, Arg.Any<DraftUsfmConfig>(), CancellationToken.None);
        env.ParatextService.Received(1).GetChaptersAsUsj(Arg.Any<UserSecret>(), Paratext01, bookNum, Arg.Any<string>());
        Assert.AreEqual(1, await env.TextDocuments.CountDocumentsAsync(_ => true));
        Assert.IsNotEmpty(env.TextDocuments.Get(textDocumentId).Content!);
    }

    private class TestEnvironment
    {
        public TestEnvironment()
        {
            BackgroundJobClient = Substitute.For<IBackgroundJobClient>();
            BackgroundJobClient.Create(Arg.Any<Job>(), Arg.Any<IState>()).Returns(JobId);
            DeltaUsxMapper = Substitute.For<IDeltaUsxMapper>();
            EventMetricService = Substitute.For<IEventMetricService>();
            ExceptionHandler = Substitute.For<IExceptionHandler>();
            HttpRequestAccessor = Substitute.For<IHttpRequestAccessor>();
            HttpRequestAccessor.SiteRoot.Returns(new Uri("https://scriptureforge.org", UriKind.Absolute));
            var hubContext = Substitute.For<IHubContext<NotificationHub, INotifier>>();
            MachineProjectService = Substitute.For<IMachineProjectService>();
            MockLogger = new MockLogger<MachineApiService>();
            ParatextService = Substitute.For<IParatextService>();
            ParatextService
                .GetParatextSettings(Arg.Any<UserSecret>(), Arg.Any<string>())
                .Returns(new ParatextSettings { Versification = ScrVers.English });
            PreTranslationService = Substitute.For<IPreTranslationService>();
            ProjectSecrets = new MemoryRepository<SFProjectSecret>(
                [
                    new SFProjectSecret
                    {
                        Id = Project01,
                        ServalData = new ServalData
                        {
                            ParallelCorpusIdForPreTranslate = ParallelCorpusId01,
                            PreTranslationEngineId = TranslationEngine01,
                            TranslationEngineId = TranslationEngine01,
                        },
                    },
                    new SFProjectSecret
                    {
                        Id = Project02,
                        ServalData = new ServalData { PreTranslationEngineId = TranslationEngine01 },
                    },
                    new SFProjectSecret { Id = Project03, ServalData = new ServalData() },
                ]
            );
            Projects = new MemoryRepository<SFProject>(
                [
                    new SFProject
                    {
                        Id = Project01,
                        ShortName = "PR1",
                        TranslateConfig = new TranslateConfig
                        {
                            DraftConfig = new DraftConfig
                            {
                                LastSelectedTranslationScriptureRanges =
                                [
                                    new ProjectScriptureRange { ScriptureRange = "GEN" },
                                ],
                                LastSelectedTrainingScriptureRanges =
                                [
                                    new ProjectScriptureRange { ScriptureRange = "EXO" },
                                ],
                                UsfmConfig = new DraftUsfmConfig
                                {
                                    ParagraphFormat = ParagraphBreakFormatOptions.MoveToEnd,
                                },
                                LastSelectedTrainingDataFiles = [TrainingDataId01],
                            },
                        },
                        ParatextId = Paratext01,
                        Texts =
                        [
                            new TextInfo
                            {
                                BookNum = 1,
                                Chapters =
                                [
                                    new Chapter { Number = 1, HasDraft = true },
                                    new Chapter { Number = 2, HasDraft = false },
                                ],
                            },
                        ],
                        UserRoles = new Dictionary<string, string> { { User01, SFProjectRole.Administrator } },
                    },
                    new SFProject
                    {
                        Id = Project02,
                        ParatextId = Paratext02,
                        TranslateConfig = new TranslateConfig
                        {
                            DraftConfig = new DraftConfig
                            {
                                AlternateSourceEnabled = true,
                                AlternateSource = new TranslateSource { ProjectRef = Project03 },
                                LastSelectedTranslationScriptureRanges =
                                [
                                    new ProjectScriptureRange { ProjectId = Project03, ScriptureRange = "GEN" },
                                ],
                                LastSelectedTrainingScriptureRanges =
                                [
                                    new ProjectScriptureRange { ProjectId = Project03, ScriptureRange = "EXO" },
                                ],
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
            TextDocuments = new MemoryRepository<TextDocument>();
            Texts = new MemoryRepository<TextData>();
            ProjectRights = Substitute.For<ISFProjectRights>();
            ProjectRights
                .HasRight(Arg.Any<SFProject>(), User01, SFProjectDomain.Drafts, Operation.Create)
                .Returns(true);
            ProjectService = Substitute.For<ISFProjectService>();
            ProjectService.SyncAsync(User01, Arg.Any<string>()).Returns(Task.FromResult(JobId));
            RealtimeService = new SFMemoryRealtimeService();
            RealtimeService.AddRepository("sf_projects", OTType.Json0, Projects);
            RealtimeService.AddRepository("text_documents", OTType.Json0, TextDocuments);
            RealtimeService.AddRepository("texts", OTType.RichText, Texts);
            ServalOptions = Options.Create(new ServalOptions { WebhookSecret = "this_is_a_secret" });
            SyncService = Substitute.For<ISyncService>();
            SyncService.SyncAsync(Arg.Any<SyncConfig>()).Returns(Task.FromResult(JobId));
            TranslationEnginesClient = Substitute.For<ITranslationEnginesClient>();
            TranslationEnginesClient
                .GetAsync(TranslationEngine01, CancellationToken.None)
                .Returns(Task.FromResult(new TranslationEngine()));
            TranslationEngineTypesClient = Substitute.For<ITranslationEngineTypesClient>();

            // Build the user secrets
            DateTime aSecondAgo = DateTime.Now - TimeSpan.FromSeconds(1);
            string accessToken1 = TokenHelper.CreateAccessToken(
                issuedAt: aSecondAgo - TimeSpan.FromMinutes(20),
                expiration: aSecondAgo,
                ParatextUserId01
            );
            UserSecrets = new MemoryRepository<UserSecret>(
                [
                    new UserSecret
                    {
                        Id = User01,
                        ParatextTokens = new Tokens { AccessToken = accessToken1, RefreshToken = "refresh_token_1234" },
                    },
                ]
            );

            Service = Substitute.ForPartsOf<MachineApiService>(
                BackgroundJobClient,
                DeltaUsxMapper,
                EventMetricService,
                ExceptionHandler,
                HttpRequestAccessor,
                hubContext,
                MockLogger,
                MachineProjectService,
                ParatextService,
                PreTranslationService,
                ProjectSecrets,
                ProjectRights,
                ProjectService,
                RealtimeService,
                ServalOptions,
                SyncService,
                TranslationEnginesClient,
                TranslationEngineTypesClient,
                UserSecrets
            );
        }

        public IBackgroundJobClient BackgroundJobClient { get; }
        public IDeltaUsxMapper DeltaUsxMapper { get; }
        public IEventMetricService EventMetricService { get; }
        public IExceptionHandler ExceptionHandler { get; }
        public IHttpRequestAccessor HttpRequestAccessor { get; }
        public IMachineProjectService MachineProjectService { get; }
        public MockLogger<MachineApiService> MockLogger { get; }
        public IParatextService ParatextService { get; }
        public IPreTranslationService PreTranslationService { get; }
        public MemoryRepository<SFProject> Projects { get; }
        public MemoryRepository<SFProjectSecret> ProjectSecrets { get; }
        public MemoryRepository<TextDocument> TextDocuments { get; }
        public MemoryRepository<TextData> Texts { get; }
        public ISFProjectRights ProjectRights { get; }
        public ISFProjectService ProjectService { get; }
        public SFMemoryRealtimeService RealtimeService { get; }
        public MachineApiService Service { get; }
        public IOptions<ServalOptions> ServalOptions { get; }
        public ISyncService SyncService { get; }
        public ITranslationEnginesClient TranslationEnginesClient { get; }
        public ITranslationEngineTypesClient TranslationEngineTypesClient { get; }
        public MemoryRepository<UserSecret> UserSecrets { get; }

        public void ConfigureDraft(
            string projectId,
            int bookNum,
            int numberOfChapters,
            bool bookExists,
            bool draftExists,
            bool canWriteBook,
            int writeChapters
        )
        {
            List<ChapterDelta> chapterDeltas = [];
            StringBuilder sb = new StringBuilder();
            sb.Append($"\\id {Canon.BookNumberToId(bookNum)}\r\n");
            List<string> usx = [];
            for (int chapterNum = 1; chapterNum <= numberOfChapters; chapterNum++)
            {
                // Build the USFM and USX for the chapter
                sb.Append($"\\c {chapterNum}\r\n\\p\r\n\\v 1 First verse\r\n\\v 2 Second verse, same as the first\r\n");
                usx.Add(
                    $"<usx version=\"3.0\"><book code=\"{Canon.BookNumberToId(bookNum)}\" style=\"id\"></book>"
                        + $"<chapter number=\"{chapterNum}\" style=\"c\" />"
                        + "<verse number=\"1\" style=\"v\" />First verse"
                        + "<verse number=\"2\" style=\"v\" />Second verse, same as the first"
                        + "</usx>"
                );

                // Return chapter deltas for that USFM
                JToken draftToken1 = JToken.Parse(
                    $"{{\"insert\": {{ \"chapter\": {{ \"number\": \"{chapterNum}\", \"style\": \"c\" }} }} }}"
                );
                JToken draftToken2 = JToken.Parse(
                    "{\"insert\": { \"verse\": { \"number\": \"1\", \"style\": \"v\" } } }"
                );
                JToken draftToken3 = JToken.Parse(
                    "{\"insert\": \"New verse 1 text\", \"attributes\": { \"segment\": \"verse_1_1\" } }"
                );
                JToken draftToken4 = JToken.Parse(
                    "{\"insert\": { \"verse\": { \"number\": \"2\", \"style\": \"v\" } } }"
                );
                JToken draftToken5 = JToken.Parse(
                    "{\"insert\": \"New verse 2 text\"," + "\"attributes\": { \"segment\": \"verse_1_2\" } }"
                );
                var chapterDelta = new ChapterDelta(
                    chapterNum,
                    2,
                    true,
                    new Delta([draftToken1, draftToken2, draftToken3, draftToken4, draftToken5])
                );
                chapterDeltas.Add(chapterDelta);

                // Create the book in the realtime server if required
                if (bookExists)
                {
                    JToken textToken1 = JToken.Parse(
                        $"{{\"insert\": {{ \"chapter\": {{ \"number\": \"{chapterNum}\", \"style\": \"c\" }} }} }}"
                    );
                    JToken textToken2 = JToken.Parse(
                        "{\"insert\": { \"verse\": { \"number\": \"1\", \"style\": \"v\" } } }"
                    );
                    JToken textToken3 = JToken.Parse(
                        "{\"insert\": { \"blank\": true }, \"attributes\": { \"segment\": \"verse_1_1\" } }"
                    );
                    JToken textToken4 = JToken.Parse(
                        "{\"insert\": { \"verse\": { \"number\": \"2\", \"style\": \"v\" } } }"
                    );
                    JToken textToken5 = JToken.Parse(
                        "{\"insert\": \"Old verse 2 text\"," + "\"attributes\": { \"segment\": \"verse_1_2\" } }"
                    );

                    TextData textData = new TextData(
                        new Delta([textToken1, textToken2, textToken3, textToken4, textToken5])
                    )
                    {
                        Id = TextData.GetTextDocId(projectId, bookNum, chapterNum),
                    };
                    Texts.Add(textData);
                }

                // Create a local copy of the draft in the realtime server if required
                if (draftExists)
                {
                    TextDocument textDocument = new TextDocument
                    {
                        Id = TextDocument.GetDocId(projectId, bookNum, chapterNum, TextDocument.Draft),
                        Type = Usj.UsjType,
                        Version = Usj.UsjVersion,
                        Content =
                        [
                            new UsjMarker
                            {
                                Type = "book",
                                Marker = "id",
                                Code = Canon.BookNumberToId(bookNum),
                            },
                            new UsjMarker
                            {
                                Type = "chapter",
                                Marker = "c",
                                Number = chapterNum.ToString(),
                            },
                            new UsjMarker
                            {
                                Type = "verse",
                                Marker = "v",
                                Number = "1",
                            },
                            "Previous verse 1 draft",
                        ],
                    };
                    TextDocuments.Add(textDocument);
                }
            }

            string usfm = sb.ToString();
            PreTranslationService
                .GetPreTranslationUsfmAsync(
                    projectId,
                    bookNum,
                    chapterNum: 0,
                    Arg.Any<DraftUsfmConfig>(),
                    CancellationToken.None
                )
                .Returns(Task.FromResult(usfm));

            ParatextService
                .GetChaptersAsUsj(Arg.Any<UserSecret>(), Paratext01, bookNum, usfm)
                .Returns(usx.Select(UsxToUsj.UsxStringToUsj));

            // Return the chapter deltas for the specific chapter
            DeltaUsxMapper
                .ToChapterDeltas(Arg.Any<XDocument>())
                .Returns(callInfo =>
                {
                    var usxDoc = callInfo.Arg<XDocument>();
                    string chapterNumber = usxDoc.Descendants("chapter").First().Attribute("number")!.Value;
                    return new[] { chapterDeltas.Single(c => c.Number == int.Parse(chapterNumber)) };
                });

            // Update the permissions for the user applying the draft
            ProjectService
                .When(x =>
                    x.UpdatePermissionsAsync(
                        Arg.Any<string>(),
                        Arg.Any<IDocument<SFProject>>(),
                        users: null,
                        books: Arg.Any<IReadOnlyList<int>>(),
                        CancellationToken.None
                    )
                )
                .Do(callInfo =>
                {
                    string userId = callInfo.ArgAt<string>(0);
                    var projectDoc = callInfo.ArgAt<IDocument<SFProject>>(1);
                    foreach (var text in projectDoc.Data.Texts)
                    {
                        text.Permissions.TryAdd(
                            userId,
                            canWriteBook ? TextInfoPermission.Write : TextInfoPermission.Read
                        );
                        foreach (var chapter in text.Chapters)
                        {
                            chapter.Permissions.TryAdd(
                                userId,
                                chapter.Number <= writeChapters ? TextInfoPermission.Write : TextInfoPermission.Read
                            );
                        }
                    }
                });
        }

        public async Task VerifyDraftAsync(
            DraftApplyResult result,
            string targetProjectId,
            int numberOfChapters,
            bool bookExists,
            bool canWriteBook,
            int writeChapters
        )
        {
            await ProjectService
                .Received()
                .UpdatePermissionsAsync(
                    User01,
                    Arg.Any<IDocument<SFProject>>(),
                    users: null,
                    books: Arg.Any<IReadOnlyList<int>>(),
                    CancellationToken.None
                );
            ExceptionHandler.DidNotReceive().ReportException(Arg.Any<Exception>());

            await Assert.ThatAsync(
                () => TextDocuments.CountDocumentsAsync(t => t != null),
                Is.EqualTo(numberOfChapters)
            );

            int numberOfTexts = 0;
            if (canWriteBook && writeChapters > 0)
            {
                // The number of texts will correspond to the number of written chapters
                numberOfTexts = writeChapters;
            }
            else if (bookExists && targetProjectId == Project01)
            {
                // The number of texts will correspond to the number of chapters in the book to start with
                numberOfTexts = numberOfChapters;
            }

            await Assert.ThatAsync(
                () => Texts.CountDocumentsAsync(t => t.Id.Contains(targetProjectId)),
                Is.EqualTo(numberOfTexts)
            );

            Assert.That(result.ChangesSaved, Is.EqualTo(canWriteBook && writeChapters > 0));
            if (writeChapters < numberOfChapters)
            {
                Assert.That(result.Failures, Is.Not.Empty);
            }
        }

        public TranslationBuild ConfigureTranslationBuild(TranslationBuild? translationBuild = null)
        {
            const string message = "Finalizing";
            const double percentCompleted = 0.95;
            const int revision = 553;
            const JobState state = JobState.Active;
            translationBuild ??= new TranslationBuild
            {
                Url = "https://example.com",
                Id = Build01,
                Engine = { Id = "engineId", Url = "https://example.com" },
                Message = message,
                Progress = percentCompleted,
                Revision = revision,
                State = state,
            };
            TranslationEnginesClient
                .CancelBuildAsync(TranslationEngine01, CancellationToken.None)
                .Returns(Task.FromResult(translationBuild));
            TranslationEnginesClient
                .GetBuildAsync(TranslationEngine01, translationBuild.Id, minRevision: null, CancellationToken.None)
                .Returns(Task.FromResult(translationBuild));
            TranslationEnginesClient
                .GetCurrentBuildAsync(TranslationEngine01, minRevision: null, CancellationToken.None)
                .Returns(Task.FromResult(translationBuild));
            TranslationEnginesClient
                .GetAllBuildsAsync(TranslationEngine01, CancellationToken.None)
                .Returns(Task.FromResult<IList<TranslationBuild>>([translationBuild]));
            return translationBuild;
        }

        public QueryResults<EventMetric> GetEventMetricsForBuildCompleted(bool sendEmailOnBuildFinished) =>
            new QueryResults<EventMetric>
            {
                Results =
                [
                    new EventMetric
                    {
                        EventType = nameof(MachineApiService.StartPreTranslationBuildAsync),
                        Payload =
                        {
                            {
                                "buildConfig",
                                BsonDocument.Parse(
                                    JsonConvert.SerializeObject(
                                        new BuildConfig
                                        {
                                            ProjectId = Project01,
                                            SendEmailOnBuildFinished = sendEmailOnBuildFinished,
                                        }
                                    )
                                )
                            },
                        },
                        ProjectId = Project01,
                        Result = new BsonString(Build01),
                        Scope = EventScope.Drafting,
                        UserId = User01,
                    },
                ],
                UnpagedCount = 1,
            };

        public async Task QueueBuildAsync(
            string sfProjectId,
            bool preTranslate,
            DateTime? dateTime,
            string? errorMessage = null,
            bool? preTranslationsRetrieved = null
        ) =>
            await ProjectSecrets.UpdateAsync(
                sfProjectId,
                u =>
                {
                    if (preTranslate)
                    {
                        u.Set(p => p.ServalData.PreTranslationJobId, JobId);
                        u.Set(p => p.ServalData.PreTranslationQueuedAt, dateTime);
                        u.Set(p => p.ServalData.PreTranslationsRetrieved, preTranslationsRetrieved);
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
                        u.Set(p => p.ServalData.TranslationQueuedAt, dateTime);
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

        /// <summary>
        /// Sets up a text document and the API calls used to create and update it.
        /// </summary>
        /// <param name="textDocumentId">The id of the document.</param>
        /// <param name="bookNum">The book number.</param>
        /// <param name="alreadyExists">
        /// If <c>true</c>, ensure the document is already in <see cref="TextDocuments"/>, but with empty content.
        /// </param>
        public void SetupTextDocument(string textDocumentId, int bookNum, bool alreadyExists)
        {
            PreTranslationService
                .GetPreTranslationUsfmAsync(Project01, bookNum, 0, Arg.Any<DraftUsfmConfig>(), CancellationToken.None)
                .Returns(Task.FromResult(TestUsfm));
            ParatextService.GetChaptersAsUsj(Arg.Any<UserSecret>(), Paratext01, bookNum, TestUsfm).Returns([TestUsj]);

            if (alreadyExists)
            {
                TextDocuments.Add(new TextDocument(textDocumentId, TestEmptyUsj));

                // Add two ops for this text document
                Op[] ops =
                [
                    new Op
                    {
                        Metadata = new OpMetadata { Timestamp = DateTime.UtcNow.AddMinutes(-30) },
                        Version = 1,
                    },
                    new Op
                    {
                        Metadata = new OpMetadata
                        {
                            Timestamp = DateTime.UtcNow.AddMinutes(-10),
                            UserId = "user01",
                            Source = OpSource.Draft,
                        },
                        Version = 2,
                    },
                ];
                RealtimeService.GetRepository<TextDocument>().SetOps(textDocumentId, ops);
            }
        }

        public static void AssertCoreBuildProperties(TranslationBuild translationBuild, ServalBuildDto? actual)
        {
            string buildDtoId = $"{Project01}.{translationBuild.Id}";
            Assert.IsNotNull(actual);
            Assert.AreEqual(translationBuild.Message, actual!.Message);
            Assert.AreEqual(translationBuild.Progress, actual.PercentCompleted);
            Assert.AreEqual(translationBuild.Revision, actual.Revision);
            Assert.AreEqual(translationBuild.State.ToString().ToUpperInvariant(), actual.State);
            Assert.AreEqual(buildDtoId, actual.Id);
            Assert.AreEqual(MachineApi.GetBuildHref(Project01, translationBuild.Id), actual.Href);
            Assert.AreEqual(Project01, actual.Engine.Id);
            Assert.AreEqual(MachineApi.GetEngineHref(Project01), actual.Engine.Href);
        }
    }
}
