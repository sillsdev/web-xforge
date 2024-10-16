using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Linq.Expressions;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;
using NSubstitute;
using NSubstitute.Core;
using NSubstitute.ExceptionExtensions;
using NUnit.Framework;
using Paratext.Data;
using Paratext.Data.ProjectComments;
using Paratext.Data.ProjectSettingsAccess;
using SIL.Scripture;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.RichText;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Realtime;
using SIL.XForge.Services;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class ParatextSyncRunnerTests
{
    [Test]
    public async Task SyncAsync_ProjectDoesNotExist()
    {
        var env = new TestEnvironment();

        // SUT
        await env.Runner.RunAsync("project03", "user01", "project03", false, CancellationToken.None);
    }

    [Test]
    public async Task SyncAsync_UserDoesNotExist()
    {
        var env = new TestEnvironment();
        env.SetupSFData(true, true, true, false);
        env.ParatextService.GetLatestSharedVersion(Arg.Any<UserSecret>(), "target").Returns("beforeSR");

        await env.Runner.RunAsync("project01", "user03", "project01", false, CancellationToken.None);

        SFProject project = env.VerifyProjectSync(false);
        Assert.That(project.Sync.DataInSync, Is.True);

        // Check that the failure was logged in the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Status, Is.EqualTo(SyncStatus.Failed));
    }

    [Test]
    public async Task SyncAsync_Error()
    {
        var env = new TestEnvironment();
        env.SetupSFData(true, true, false, false);
        env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2));
        env.DeltaUsxMapper.When(d => d.ToChapterDeltas(Arg.Any<XDocument>())).Do(x => throw new Exception());

        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        SFProject project = env.VerifyProjectSync(false);
        Assert.That(project.Sync.DataInSync, Is.False);

        // Check that the failure was logged in the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Status, Is.EqualTo(SyncStatus.Failed));
    }

    [Test]
    public async Task SyncAsync_KeepsErrorStateWhenRunningAgain()
    {
        var env = new TestEnvironment();
        int count = 0;
        env.SetupSFData(true, true, false, false);
        env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2));
        env.DeltaUsxMapper.When(d => d.ToChapterDeltas(Arg.Any<XDocument>()))
            .Do(x =>
            {
                // Throw an exception for the first two times this is executed
                if (count++ < 2)
                {
                    throw new Exception();
                }
            });

        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        SFProject project = env.VerifyProjectSync(false);
        Assert.That(project.Sync.DataInSync, Is.False);

        // Check that the failure was logged in the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Status, Is.EqualTo(SyncStatus.Failed));

        // Run a second time, keeping the same sync metrics id
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        // Check that the previous failure was logged in the previous sync metrics, and the current failure is recorded too
        syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Status, Is.EqualTo(SyncStatus.Failed));
        Assert.That(syncMetrics.PreviousSyncs.Count, Is.EqualTo(1));
        Assert.That(syncMetrics.PreviousSyncs.First().Status, Is.EqualTo(SyncStatus.Failed));

        // Run for a third time, keeping the same sync metrics id
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        // Check that the previous failures were logged in the previous sync metrics, and the current success is recorded
        syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Status, Is.EqualTo(SyncStatus.Successful));
        Assert.That(syncMetrics.PreviousSyncs.Count, Is.EqualTo(2));
        Assert.That(syncMetrics.PreviousSyncs.First().Status, Is.EqualTo(SyncStatus.Failed));
        Assert.That(syncMetrics.PreviousSyncs.Last().Status, Is.EqualTo(SyncStatus.Failed));
    }

    [Test]
    public async Task SyncAsync_NewProjectTranslationSuggestionsAndCheckingDisabled()
    {
        var env = new TestEnvironment();
        env.SetupSFData(false, false, false, false);
        env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2, false));

        await env.Runner.RunAsync("project01", "user01", "project01", true, CancellationToken.None);

        Assert.That(env.ContainsText("project01", "MAT", 1), Is.True);
        Assert.That(env.ContainsText("project01", "MAT", 2), Is.True);
        Assert.That(env.ContainsText("project01", "MRK", 1), Is.True);
        Assert.That(env.ContainsText("project01", "MRK", 2), Is.True);

        Assert.That(env.ContainsText("project02", "MAT", 1), Is.False);
        Assert.That(env.ContainsText("project02", "MAT", 2), Is.False);
        Assert.That(env.ContainsText("project02", "MRK", 1), Is.False);
        Assert.That(env.ContainsText("project02", "MRK", 2), Is.False);

        Assert.That(env.ContainsQuestion("MAT", 1), Is.False);
        Assert.That(env.ContainsQuestion("MAT", 2), Is.False);
        Assert.That(env.ContainsQuestion("MRK", 1), Is.False);
        Assert.That(env.ContainsQuestion("MRK", 2), Is.False);

        env.VerifyProjectSync(true);

        // Verify the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Books, Is.EqualTo(new SyncMetricInfo(added: 2, deleted: 0, updated: 0)));
        Assert.That(syncMetrics.TextDocs, Is.EqualTo(new SyncMetricInfo(added: 4, deleted: 0, updated: 0)));
        syncMetrics = env.GetSyncMetrics("project02");
        Assert.That(syncMetrics.Books, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 0)));
        Assert.That(syncMetrics.TextDocs, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 0)));
    }

    [Test]
    public async Task SyncAsync_NewProjectTranslationSuggestionsAndCheckingEnabled()
    {
        var env = new TestEnvironment();
        env.SetupSFData(true, true, false, false);
        env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2, false));

        await env.Runner.RunAsync("project02", "user01", "project02", true, CancellationToken.None);
        await env.Runner.RunAsync("project01", "user01", "project01", true, CancellationToken.None);

        Assert.That(env.ContainsText("project01", "MAT", 1), Is.True);
        Assert.That(env.ContainsText("project01", "MAT", 2), Is.True);
        Assert.That(env.ContainsText("project01", "MRK", 1), Is.True);
        Assert.That(env.ContainsText("project01", "MRK", 2), Is.True);

        Assert.That(env.ContainsText("project02", "MAT", 1), Is.True);
        Assert.That(env.ContainsText("project02", "MAT", 2), Is.True);
        Assert.That(env.ContainsText("project02", "MRK", 1), Is.False);
        Assert.That(env.ContainsText("project02", "MRK", 2), Is.False);

        Assert.That(env.ContainsQuestion("MAT", 1), Is.False);
        Assert.That(env.ContainsQuestion("MAT", 2), Is.False);
        Assert.That(env.ContainsQuestion("MRK", 1), Is.False);
        Assert.That(env.ContainsQuestion("MRK", 2), Is.False);

        env.VerifyProjectSync(true);

        // Verify the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Books, Is.EqualTo(new SyncMetricInfo(added: 2, deleted: 0, updated: 0)));
        Assert.That(syncMetrics.TextDocs, Is.EqualTo(new SyncMetricInfo(added: 4, deleted: 0, updated: 0)));
        syncMetrics = env.GetSyncMetrics("project02");
        Assert.That(syncMetrics.Books, Is.EqualTo(new SyncMetricInfo(added: 1, deleted: 0, updated: 0)));
        Assert.That(syncMetrics.TextDocs, Is.EqualTo(new SyncMetricInfo(added: 2, deleted: 0, updated: 0)));
    }

    [Test]
    public async Task SyncAsync_NewProjectOnlyTranslationSuggestionsEnabled()
    {
        var env = new TestEnvironment();
        env.SetupSFData(true, false, false, false);
        env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2, false));

        await env.Runner.RunAsync("project02", "user01", "project02", true, CancellationToken.None);
        await env.Runner.RunAsync("project01", "user01", "project01", true, CancellationToken.None);

        Assert.That(env.ContainsText("project01", "MAT", 1), Is.True);
        Assert.That(env.ContainsText("project01", "MAT", 2), Is.True);
        Assert.That(env.ContainsText("project01", "MRK", 1), Is.True);
        Assert.That(env.ContainsText("project01", "MRK", 2), Is.True);

        Assert.That(env.ContainsText("project02", "MAT", 1), Is.True);
        Assert.That(env.ContainsText("project02", "MAT", 2), Is.True);
        Assert.That(env.ContainsText("project02", "MRK", 1), Is.False);
        Assert.That(env.ContainsText("project02", "MRK", 2), Is.False);

        Assert.That(env.ContainsQuestion("MAT", 1), Is.False);
        Assert.That(env.ContainsQuestion("MAT", 2), Is.False);
        Assert.That(env.ContainsQuestion("MRK", 1), Is.False);
        Assert.That(env.ContainsQuestion("MRK", 2), Is.False);

        env.VerifyProjectSync(true);

        // Verify the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Books, Is.EqualTo(new SyncMetricInfo(added: 2, deleted: 0, updated: 0)));
        Assert.That(syncMetrics.TextDocs, Is.EqualTo(new SyncMetricInfo(added: 4, deleted: 0, updated: 0)));
        syncMetrics = env.GetSyncMetrics("project02");
        Assert.That(syncMetrics.Books, Is.EqualTo(new SyncMetricInfo(added: 1, deleted: 0, updated: 0)));
        Assert.That(syncMetrics.TextDocs, Is.EqualTo(new SyncMetricInfo(added: 2, deleted: 0, updated: 0)));
    }

    [Test]
    public async Task SyncAsync_NewProjectOnlyCheckingEnabled()
    {
        var env = new TestEnvironment();
        env.SetupSFData(false, true, false, false);
        env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2, false));

        await env.Runner.RunAsync("project01", "user01", "project01", true, CancellationToken.None);

        Assert.That(env.ContainsText("project01", "MAT", 1), Is.True);
        Assert.That(env.ContainsText("project01", "MAT", 2), Is.True);
        Assert.That(env.ContainsText("project01", "MRK", 1), Is.True);
        Assert.That(env.ContainsText("project01", "MRK", 2), Is.True);

        Assert.That(env.ContainsText("project02", "MAT", 1), Is.False);
        Assert.That(env.ContainsText("project02", "MAT", 2), Is.False);
        Assert.That(env.ContainsText("project02", "MRK", 1), Is.False);
        Assert.That(env.ContainsText("project02", "MRK", 2), Is.False);

        Assert.That(env.ContainsQuestion("MAT", 1), Is.False);
        Assert.That(env.ContainsQuestion("MAT", 2), Is.False);
        Assert.That(env.ContainsQuestion("MRK", 1), Is.False);
        Assert.That(env.ContainsQuestion("MRK", 2), Is.False);

        env.VerifyProjectSync(true);

        // Verify the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Books, Is.EqualTo(new SyncMetricInfo(added: 2, deleted: 0, updated: 0)));
        Assert.That(syncMetrics.TextDocs, Is.EqualTo(new SyncMetricInfo(added: 4, deleted: 0, updated: 0)));
        syncMetrics = env.GetSyncMetrics("project02");
        Assert.That(syncMetrics.Books, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 0)));
        Assert.That(syncMetrics.TextDocs, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 0)));
    }

    [Test]
    public async Task SyncAsync_NewProjectOnlyNoMatchingSourceText_TranslationSuggestionEnabled()
    {
        var env = new TestEnvironment();
        env.SetupSFData(true, false, false, false);
        env.SetupPTData(new Book("MAT", 2, false));

        await env.Runner.RunAsync("project02", "user01", "project02", true, CancellationToken.None);
        await env.Runner.RunAsync("project01", "user01", "project01", true, CancellationToken.None);

        Assert.That(env.ContainsText("project01", "MAT", 1), Is.True);
        Assert.That(env.ContainsText("project01", "MAT", 2), Is.True);
        Assert.That(env.ContainsText("project02", "MAT", 1), Is.False);
        Assert.That(env.ContainsText("project02", "MAT", 2), Is.False);

        env.VerifyProjectSync(true);

        // Verify the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Books, Is.EqualTo(new SyncMetricInfo(added: 1, deleted: 0, updated: 0)));
        Assert.That(syncMetrics.TextDocs, Is.EqualTo(new SyncMetricInfo(added: 2, deleted: 0, updated: 0)));
        syncMetrics = env.GetSyncMetrics("project02");
        Assert.That(syncMetrics.Books, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 0)));
        Assert.That(syncMetrics.TextDocs, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 0)));
    }

    [Test]
    public async Task SyncAsync_DataNotChanged()
    {
        var env = new TestEnvironment();
        Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
        env.SetupSFData(true, true, false, false, books);
        env.SetupPTData(books);

        // SUT
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        env.MockLogger.AssertEventCount(
            (LogEvent logEvent) =>
                logEvent.LogLevel == LogLevel.Information && Regex.IsMatch(logEvent.Message, "Starting"),
            1
        );

        await env
            .ParatextService.DidNotReceive()
            .PutBookText(Arg.Any<UserSecret>(), "target", 40, Arg.Any<XDocument>());
        await env
            .ParatextService.DidNotReceive()
            .PutBookText(Arg.Any<UserSecret>(), "target", 41, Arg.Any<XDocument>());

        await env
            .ParatextService.DidNotReceive()
            .PutBookText(Arg.Any<UserSecret>(), "source", 40, Arg.Any<XDocument>());
        await env
            .ParatextService.DidNotReceive()
            .PutBookText(Arg.Any<UserSecret>(), "source", 41, Arg.Any<XDocument>());

        var delta = Delta.New().InsertText("text");
        Assert.That(env.GetText("project01", "MAT", 1).DeepEquals(delta), Is.True);
        Assert.That(env.GetText("project01", "MAT", 2).DeepEquals(delta), Is.True);
        Assert.That(env.GetText("project01", "MRK", 1).DeepEquals(delta), Is.True);
        Assert.That(env.GetText("project01", "MRK", 2).DeepEquals(delta), Is.True);

        Assert.That(env.GetText("project02", "MAT", 1).DeepEquals(delta), Is.True);
        Assert.That(env.GetText("project02", "MAT", 2).DeepEquals(delta), Is.True);
        Assert.That(env.GetText("project02", "MRK", 1).DeepEquals(delta), Is.True);
        Assert.That(env.GetText("project02", "MRK", 2).DeepEquals(delta), Is.True);

        env.ParatextService.DidNotReceive().PutNotes(Arg.Any<UserSecret>(), "target", Arg.Any<XElement>());

        SFProject project = env.VerifyProjectSync(true);
        Assert.That(project.ParatextUsers.Count, Is.EqualTo(2));
        Assert.That(project.UserRoles["user01"], Is.EqualTo(SFProjectRole.Administrator));
        Assert.That(project.UserRoles["user02"], Is.EqualTo(SFProjectRole.Translator));
    }

    [Test]
    public async Task SyncAsync_DataChangedTranslateAndCheckingEnabled()
    {
        var env = new TestEnvironment();
        Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
        env.SetupSFData(true, true, true, false, books);
        env.SetupPTData(books);

        await env.Runner.RunAsync("project02", "user01", "project02", false, CancellationToken.None);
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        await env
            .ParatextService.Received()
            .PutBookText(Arg.Any<UserSecret>(), "target", 40, Arg.Any<XDocument>(), Arg.Any<Dictionary<int, string>>());
        await env
            .ParatextService.Received()
            .PutBookText(Arg.Any<UserSecret>(), "target", 41, Arg.Any<XDocument>(), Arg.Any<Dictionary<int, string>>());

        await env
            .ParatextService.Received()
            .PutBookText(Arg.Any<UserSecret>(), "source", 40, Arg.Any<XDocument>(), Arg.Any<Dictionary<int, string>>());
        await env
            .ParatextService.Received()
            .PutBookText(Arg.Any<UserSecret>(), "source", 41, Arg.Any<XDocument>(), Arg.Any<Dictionary<int, string>>());

        var delta = Delta.New().InsertText("text");
        Assert.That(env.GetText("project01", "MAT", 1).DeepEquals(delta), Is.True);
        Assert.That(env.GetText("project01", "MAT", 2).DeepEquals(delta), Is.True);
        Assert.That(env.GetText("project01", "MRK", 1).DeepEquals(delta), Is.True);
        Assert.That(env.GetText("project01", "MRK", 2).DeepEquals(delta), Is.True);

        Assert.That(env.GetText("project02", "MAT", 1).DeepEquals(delta), Is.True);
        Assert.That(env.GetText("project02", "MAT", 2).DeepEquals(delta), Is.True);
        Assert.That(env.GetText("project02", "MRK", 1).DeepEquals(delta), Is.True);
        Assert.That(env.GetText("project02", "MRK", 2).DeepEquals(delta), Is.True);

        env.ParatextService.Received(2).PutNotes(Arg.Any<UserSecret>(), "target", Arg.Any<XElement>());

        SFProject project = env.GetProject();
        Assert.That(project.ParatextUsers.Count, Is.EqualTo(2));
        env.VerifyProjectSync(true);
    }

    [Test]
    public async Task SyncAsync_DataChangedTranslateEnabledCheckingDisabled()
    {
        var env = new TestEnvironment();
        Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
        env.SetupSFData(true, false, true, false, books);
        env.SetupPTData(books);

        await env.Runner.RunAsync("project02", "user01", "project02", false, CancellationToken.None);
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        await env
            .ParatextService.Received()
            .PutBookText(Arg.Any<UserSecret>(), "target", 40, Arg.Any<XDocument>(), Arg.Any<Dictionary<int, string>>());
        await env
            .ParatextService.Received()
            .PutBookText(Arg.Any<UserSecret>(), "target", 41, Arg.Any<XDocument>(), Arg.Any<Dictionary<int, string>>());

        await env
            .ParatextService.Received()
            .PutBookText(Arg.Any<UserSecret>(), "source", 40, Arg.Any<XDocument>(), Arg.Any<Dictionary<int, string>>());
        await env
            .ParatextService.Received()
            .PutBookText(Arg.Any<UserSecret>(), "source", 41, Arg.Any<XDocument>(), Arg.Any<Dictionary<int, string>>());

        env.ParatextService.DidNotReceive().PutNotes(Arg.Any<UserSecret>(), "target", Arg.Any<XElement>());

        var delta = Delta.New().InsertText("text");
        Assert.That(env.GetText("project01", "MAT", 1).DeepEquals(delta), Is.True);
        Assert.That(env.GetText("project01", "MAT", 2).DeepEquals(delta), Is.True);
        Assert.That(env.GetText("project01", "MRK", 1).DeepEquals(delta), Is.True);
        Assert.That(env.GetText("project01", "MRK", 2).DeepEquals(delta), Is.True);

        Assert.That(env.GetText("project02", "MAT", 1).DeepEquals(delta), Is.True);
        Assert.That(env.GetText("project02", "MAT", 2).DeepEquals(delta), Is.True);
        Assert.That(env.GetText("project02", "MRK", 1).DeepEquals(delta), Is.True);
        Assert.That(env.GetText("project02", "MRK", 2).DeepEquals(delta), Is.True);

        SFProject project = env.GetProject();
        Assert.That(project.ParatextUsers.Count, Is.EqualTo(2));
        env.VerifyProjectSync(true);

        // Verify the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Books, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 2)));
        Assert.That(syncMetrics.TextDocs, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 4)));
        syncMetrics = env.GetSyncMetrics("project02");
        Assert.That(syncMetrics.Books, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 2)));
        Assert.That(syncMetrics.TextDocs, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 4)));
    }

    [Test]
    public async Task SyncAsync_ChaptersChanged()
    {
        var env = new TestEnvironment();
        env.SetupSFData(true, true, false, false, new Book("MAT", 2), new Book("MRK", 2));
        env.SetupPTData(new Book("MAT", 3), new Book("MRK", 1));
        Book[] books = new[] { new Book("MRK", 2) };
        env.AddParatextNoteThreadData(books);
        Assert.That(env.ContainsNote(1), Is.True);

        await env.Runner.RunAsync("project02", "user01", "project02", false, CancellationToken.None);
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);
        env.ParatextService.Received()
            .GetNoteThreadChanges(
                Arg.Any<UserSecret>(),
                "target",
                41,
                Arg.Is<IEnumerable<IDocument<NoteThread>>>(threads => threads.Any(t => t.Id == "project01:dataId01")),
                Arg.Any<Dictionary<int, ChapterDelta>>(),
                Arg.Any<Dictionary<string, ParatextUserProfile>>()
            );

        Assert.That(env.ContainsText("project01", "MAT", 3), Is.True);
        Assert.That(env.ContainsText("project01", "MRK", 2), Is.False);

        Assert.That(env.ContainsText("project02", "MAT", 3), Is.True);
        Assert.That(env.ContainsText("project02", "MRK", 2), Is.False);

        Assert.That(env.ContainsQuestion("MAT", 2), Is.True);
        Assert.That(env.ContainsQuestion("MRK", 2), Is.False);
        Assert.That(env.ContainsNote(1), Is.True);
        env.VerifyProjectSync(true);

        // Verify the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Books, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 2)));
        Assert.That(syncMetrics.TextDocs, Is.EqualTo(new SyncMetricInfo(added: 1, deleted: 1, updated: 0)));
        Assert.That(syncMetrics.Questions, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 1, updated: 0)));
        syncMetrics = env.GetSyncMetrics("project02");
        Assert.That(syncMetrics.Books, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 2)));
        Assert.That(syncMetrics.TextDocs, Is.EqualTo(new SyncMetricInfo(added: 1, deleted: 1, updated: 0)));
        Assert.That(syncMetrics.Questions, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 1, updated: 0)));
    }

    [Test]
    public async Task SyncAsync_ChapterValidityChanged()
    {
        var env = new TestEnvironment();
        env.SetupSFData(true, true, false, false, new Book("MAT", 2), new Book("MRK", 2) { InvalidChapters = { 1 } });
        env.SetupPTData(new Book("MAT", 2) { InvalidChapters = { 2 } }, new Book("MRK", 2));

        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        SFProject project = env.GetProject();
        Assert.That(project.Texts[0].Chapters[0].IsValid, Is.True);
        Assert.That(project.Texts[0].Chapters[1].IsValid, Is.False);
        Assert.That(project.Texts[1].Chapters[0].IsValid, Is.True);
        Assert.That(project.Texts[1].Chapters[1].IsValid, Is.True);
        env.VerifyProjectSync(true);
    }

    [Test]
    public async Task SyncAsync_BooksChanged()
    {
        var env = new TestEnvironment();
        env.SetupSFData(true, true, false, false, new Book("MAT", 2), new Book("MRK", 2));
        env.SetupPTData(new Book("MAT", 2), new Book("LUK", 2));
        // Need to make sure we have notes BEFORE the sync
        Book[] books = new[] { new Book("MAT", 2), new Book("MRK", 2) };
        env.AddParatextNoteThreadData(books);

        // Expectations of setup
        Assert.That(env.ContainsText("project01", "MRK", 1), Is.True);
        Assert.That(env.ContainsText("project01", "MRK", 2), Is.True);
        Assert.That(env.ContainsText("project01", "LUK", 1), Is.False);
        Assert.That(env.ContainsText("project01", "LUK", 2), Is.False);

        Assert.That(env.ContainsText("project02", "MRK", 1), Is.True);
        Assert.That(env.ContainsText("project02", "MRK", 2), Is.True);
        Assert.That(env.ContainsText("project02", "LUK", 1), Is.False);
        Assert.That(env.ContainsText("project02", "LUK", 2), Is.False);

        Assert.That(env.ContainsQuestion("MRK", 1), Is.True);
        Assert.That(env.ContainsQuestion("MRK", 2), Is.True);
        Assert.That(env.ContainsQuestion("MAT", 1), Is.True);
        Assert.That(env.ContainsQuestion("MAT", 2), Is.True);

        Assert.That(env.ContainsNote(2), Is.True);

        // SUT
        await env.Runner.RunAsync("project02", "user01", "project02", false, CancellationToken.None);
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        Assert.That(env.ContainsText("project01", "MRK", 1), Is.False);
        Assert.That(env.ContainsText("project01", "MRK", 2), Is.False);
        Assert.That(env.ContainsText("project01", "LUK", 1), Is.True);
        Assert.That(env.ContainsText("project01", "LUK", 2), Is.True);

        Assert.That(env.ContainsText("project02", "MRK", 1), Is.False);
        Assert.That(env.ContainsText("project02", "MRK", 2), Is.False);
        Assert.That(env.ContainsText("project02", "LUK", 1), Is.True);
        Assert.That(env.ContainsText("project02", "LUK", 2), Is.True);

        Assert.That(env.ContainsQuestion("MRK", 1), Is.False);
        Assert.That(env.ContainsQuestion("MRK", 2), Is.False);
        Assert.That(env.ContainsQuestion("MAT", 1), Is.True);
        Assert.That(env.ContainsQuestion("MAT", 2), Is.True);

        Assert.That(env.ContainsNote(2), Is.False);
        env.VerifyProjectSync(true);

        // Verify the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Books, Is.EqualTo(new SyncMetricInfo(added: 1, deleted: 1, updated: 1)));
        Assert.That(syncMetrics.TextDocs, Is.EqualTo(new SyncMetricInfo(added: 2, deleted: 2, updated: 0)));
        Assert.That(
            syncMetrics.Notes,
            Is.EqualTo(new NoteSyncMetricInfo(added: 0, deleted: 0, updated: 0, removed: 0))
        );
        Assert.That(syncMetrics.NoteThreads, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 1, updated: 0)));
        Assert.That(syncMetrics.Questions, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 2, updated: 0)));
        syncMetrics = env.GetSyncMetrics("project02");
        Assert.That(syncMetrics.Books, Is.EqualTo(new SyncMetricInfo(added: 1, deleted: 1, updated: 1)));
        Assert.That(syncMetrics.TextDocs, Is.EqualTo(new SyncMetricInfo(added: 2, deleted: 2, updated: 0)));
        Assert.That(
            syncMetrics.Notes,
            Is.EqualTo(new NoteSyncMetricInfo(added: 0, deleted: 0, updated: 0, removed: 0))
        );
        Assert.That(syncMetrics.NoteThreads, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 0)));
        Assert.That(syncMetrics.Questions, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 2, updated: 0)));
    }

    [Test]
    public async Task SyncAsync_UserRoleChangedAndUserRemoved()
    {
        var env = new TestEnvironment();
        Book[] books = [new Book("MAT", 2), new Book("MRK", 2)];
        env.SetupSFData(true, true, false, false, books);
        env.SetupPTData(books);
        env.ParatextService.GetParatextUsersAsync(
                Arg.Any<UserSecret>(),
                Arg.Is((SFProject project) => project.ParatextId == "target"),
                Arg.Any<CancellationToken>()
            )
            .Returns([TestEnvironment.ParatextProjectUser01 with { Role = SFProjectRole.Translator }]);

        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        SFProject project = env.VerifyProjectSync(true);
        Assert.That(project.UserRoles["user01"], Is.EqualTo(SFProjectRole.Translator));
        await env.SFProjectService.Received().RemoveUserWithoutPermissionsCheckAsync("user01", "project01", "user02");

        // Verify the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Users, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 1, updated: 0)));
    }

    [Test]
    public async Task SyncAsync_SetsUserPermissions()
    {
        var env = new TestEnvironment();
        Book[] books = [new Book("MAT", 2), new Book("MRK", 2)];
        env.SetupSFData(true, true, false, false, books);
        env.SetupPTData(books);
        env.ParatextService.GetParatextUsersAsync(
                Arg.Any<UserSecret>(),
                Arg.Is((SFProject project) => project.ParatextId == "target"),
                Arg.Any<CancellationToken>()
            )
            .Returns([TestEnvironment.ParatextProjectUser01 with { Role = SFProjectRole.Translator }]);

        // SUT
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        await env
            .SFProjectService.Received()
            .UpdatePermissionsAsync(
                "user01",
                Arg.Is<IDocument<SFProject>>(
                    (IDocument<SFProject> sfProjDoc) =>
                        sfProjDoc.Data.Id == "project01" && sfProjDoc.Data.ParatextId == "target"
                ),
                Arg.Any<IReadOnlyList<ParatextProjectUser>>(),
                Arg.Any<CancellationToken>()
            );
    }

    [Test]
    public async Task SyncAsync_RefreshToken_UnauthorizedAccessException()
    {
        var env = new TestEnvironment();
        Book[] books = [new Book("MAT", 2), new Book("MRK", 2)];
        env.SetupSFData(true, true, false, false, books);
        env.SetupPTData(books);
        env.ParatextService.GetParatextUsersAsync(Arg.Any<UserSecret>(), Arg.Any<SFProject>(), CancellationToken.None)
            .Throws<UnauthorizedAccessException>();

        // SUT
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        // Check that the Exception was logged
        env.MockLogger.AssertHasEvent((LogEvent logEvent) => logEvent.Exception is not null);

        // Check that the exception was logged in the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Status, Is.EqualTo(SyncStatus.Failed));
        StringAssert.StartsWith("System.UnauthorizedAccessException", syncMetrics.ErrorDetails);
    }

    [Test]
    public async Task SyncAsync_ProjectTextSetToNotEditable()
    {
        var env = new TestEnvironment();
        Book[] books = [new Book("MAT", 1)];
        env.SetupSFData(true, true, true, false, books);
        env.SetupPTData(books);
        SFProject project = env.GetProject("project01");
        Assert.That(project.Editable, Is.True, "setup");
        env.ParatextService.GetParatextUsersAsync(
                Arg.Any<UserSecret>(),
                Arg.Is((SFProject project) => project.ParatextId == "target"),
                Arg.Any<CancellationToken>()
            )
            .Returns([TestEnvironment.ParatextProjectUser01]);

        env.ParatextService.GetParatextSettings(Arg.Any<UserSecret>(), Arg.Any<string>())
            .Returns(new ParatextSettings { Editable = false });

        // SUT
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);
        await env.ParatextService.DidNotReceiveWithAnyArgs().PutBookText(default, default, default, default, default);
        project = env.VerifyProjectSync(true);
        Assert.That(project.Editable, Is.False);
    }

    [Test]
    public async Task SyncAsync_CreatesNoteTagIcon()
    {
        var env = new TestEnvironment();
        Book[] books = { new Book("MAT", 1) };
        env.SetupSFData(true, true, false, true, books);
        await env.SetupUndefinedNoteTag("project01", false);
        SFProject project = env.GetProject();
        Assert.That(project.TranslateConfig.DefaultNoteTagId, Is.Null);
        // introduce a PT note thread
        env.AddParatextNoteThreadData(books);
        env.SetupPTData(books);

        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);
        env.VerifyProjectSync(true, null, "project01");
        // expect that we do not create a new note tag
        env.ParatextService.DidNotReceive()
            .UpdateCommentTag(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<NoteTag>());

        // introduce an SF note thread
        env.AddParatextNoteThreadData(books, true);
        env.ParatextService.UpdateCommentTag(Arg.Any<UserSecret>(), "target", Arg.Any<NoteTag>())
            .Returns(env.translateNoteTagId);
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);
        project = env.VerifyProjectSync(true, null, "project01");
        // expect that a new note tag is created
        env.ParatextService.Received().UpdateCommentTag(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<NoteTag>());
        Assert.That(project.TranslateConfig.DefaultNoteTagId, Is.EqualTo(env.translateNoteTagId));
    }

    [Test]
    public async Task SyncAsync_CreatesCheckingNoteTag()
    {
        var env = new TestEnvironment();
        Book[] books = { new Book("MAT", 1) };
        env.SetupSFData(false, true, false, false, books);
        env.SetupPTData(books);

        SFProject project = env.GetProject("project05");
        Assert.That(project.CheckingConfig.NoteTagId, Is.Null, "setup");
        Assert.That(env.ContainsQuestion("project05", "MAT", 1), Is.False, "setup");
        // project05 does not have checking answers and will not create a tag
        await env.Runner.RunAsync("project05", "user01", "project05", false, CancellationToken.None);
        env.ParatextService.DidNotReceive().UpdateCommentTag(Arg.Any<UserSecret>(), "target", Arg.Any<NoteTag>());

        await env.SetupUndefinedNoteTag("project01", true);
        project = env.GetProject();
        Assert.That(project.CheckingConfig.NoteTagId, Is.Null, "setup");
        Assert.That(env.ContainsQuestion("MAT", 1), Is.True, "setup");
        // simulate project01 does not have answers to export
        XElement notesElem = new XElement("notes", new XAttribute("version", "1.1"));
        var threadElem = new XElement("thread", new XAttribute("id", "thread01"));
        notesElem.Add(threadElem);

        env.NotesMapper.GetNotesChangelistAsync(
                Arg.Any<XElement>(),
                Arg.Any<IEnumerable<IDocument<Question>>>(),
                Arg.Any<Dictionary<string, ParatextUserProfile>>(),
                Arg.Any<Dictionary<string, string>>(),
                CheckingAnswerExport.MarkedForExport,
                Arg.Any<int>()
            )
            .Returns(Task.FromResult(notesElem));
        // project01 has questions but does not export any
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);
        env.ParatextService.DidNotReceive().UpdateCommentTag(Arg.Any<UserSecret>(), "target", Arg.Any<NoteTag>());

        // simulate project01 with exported answers
        await env.AddAnswerToQuestion("project01", "MAT", 1);

        // project01 has checking answers and will need to create a tag
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);
        env.ParatextService.Received(1).UpdateCommentTag(Arg.Any<UserSecret>(), "target", Arg.Any<NoteTag>());
        env.VerifyProjectSync(true);
    }

    [Test]
    public async Task SyncAsync_UpdatesExistingNoteTags()
    {
        var env = new TestEnvironment();
        Book[] books = { new Book("MAT", 1) };
        env.SetupSFData(true, true, false, true, books);
        var noteTags = new List<NoteTag>
        {
            new NoteTag
            {
                TagId = 1,
                Name = "To do",
                Icon = NoteTag.defaultTagIcon
            },
            new NoteTag
            {
                TagId = 2,
                Name = "Original tag",
                Icon = "originalIcon"
            },
            new NoteTag
            {
                TagId = 3,
                Name = "Tag to delete",
                Icon = "delete"
            }
        };
        await env.SetupProjectNoteTags("project01", noteTags);
        env.SetupPTData(books);
        var newNoteTags = new List<NoteTag>
        {
            new NoteTag
            {
                TagId = 1,
                Name = "To do",
                Icon = NoteTag.defaultTagIcon
            },
            new NoteTag
            {
                TagId = 2,
                Name = "Edited tag",
                Icon = "editedIcon"
            }
        };
        env.ParatextService.GetParatextSettings(Arg.Any<UserSecret>(), Arg.Any<string>())
            .Returns(new ParatextSettings { NoteTags = newNoteTags });

        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);
        SFProject project = env.VerifyProjectSync(true, null, "project01");
        Assert.That(project.NoteTags.Select(t => t.Name), Is.EquivalentTo(newNoteTags.Select(t => t.Name)));
    }

    [Test]
    public async Task SyncAsync_SetsProjectSettings()
    {
        var env = new TestEnvironment();
        Book[] books = [new Book("MAT", 1)];
        env.SetupSFData(true, true, true, false, books);
        env.SetupPTData(books);

        var ptUserRoles = new Dictionary<string, string> { { "pt01", SFProjectRole.Administrator } };
        env.ParatextService.GetParatextUsersAsync(
                Arg.Any<UserSecret>(),
                Arg.Is<SFProject>(project => project.ParatextId == "target"),
                Arg.Any<CancellationToken>()
            )
            .Returns([TestEnvironment.ParatextProjectUser01]);
        int fontSize = 10;
        string font = ProjectSettings.defaultFontName;
        string sourceWritingSystemTag = "en";
        SFProject project = env.GetProject();
        Assert.That(project.DefaultFontSize, Is.EqualTo(fontSize));
        Assert.That(project.DefaultFont, Is.EqualTo(font));
        Assert.IsNull(project.WritingSystem.Tag);
        Assert.IsNull(project.CopyrightBanner);
        Assert.IsNull(project.CopyrightNotice);
        Assert.That(project.TranslateConfig.Source.WritingSystem.Tag, Is.EqualTo(sourceWritingSystemTag));
        int newFontSize = 16;
        string newFont = "Doulos SIL";
        string customIcon = "customIcon01";
        string newWritingSystemTag = "en-US";
        List<NoteTag> noteTags = new List<NoteTag>
        {
            new NoteTag
            {
                TagId = env.translateNoteTagId,
                Icon = customIcon,
                Name = "Tag Name"
            }
        };
        string newProjectType = ProjectType.BackTranslation.ToString();
        string? newBaseProjectParatextId = "base_pt";
        string newBaseProjectShortName = "BPT";
        const string newCopyrightBanner = "Copyright Banner Goes Here";
        const string newCopyrightNotice = $"<p>Notification: {newCopyrightBanner}</p><p>Copyright Notice Goes Here</p>";
        env.ParatextService.GetParatextSettings(Arg.Any<UserSecret>(), Arg.Any<string>())
            .Returns(
                new ParatextSettings
                {
                    DefaultFontSize = newFontSize,
                    DefaultFont = newFont,
                    NoteTags = noteTags,
                    LanguageTag = newWritingSystemTag,
                    ProjectType = newProjectType,
                    BaseProjectParatextId = newBaseProjectParatextId,
                    BaseProjectShortName = newBaseProjectShortName,
                    CopyrightBanner = newCopyrightBanner,
                    CopyrightNotice = newCopyrightNotice,
                }
            );

        // SUT
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);
        project = env.VerifyProjectSync(true);
        Assert.That(project.DefaultFontSize, Is.EqualTo(newFontSize));
        Assert.That(project.DefaultFont, Is.EqualTo(newFont));
        Assert.That(project.NoteTags.Select(t => t.Icon), Is.EquivalentTo(new[] { customIcon }));
        Assert.That(project.WritingSystem.Tag, Is.EqualTo(newWritingSystemTag));
        Assert.That(project.TranslateConfig.Source.WritingSystem.Tag, Is.EqualTo(newWritingSystemTag));
        Assert.That(project.TranslateConfig.ProjectType, Is.EqualTo(newProjectType));
        Assert.That(project.TranslateConfig.BaseProject.ParatextId, Is.EqualTo(newBaseProjectParatextId));
        Assert.That(project.TranslateConfig.BaseProject.ShortName, Is.EqualTo(newBaseProjectShortName));
        Assert.That(project.CopyrightBanner, Is.EqualTo(newCopyrightBanner));
        Assert.That(project.CopyrightNotice, Is.EqualTo(newCopyrightNotice));

        // Change the base project configuration and remove copyright banner & message
        newProjectType = ProjectType.Daughter.ToString();
        newBaseProjectParatextId = "daughter_pt";
        newBaseProjectShortName = "DPT";
        env.ParatextService.GetParatextSettings(Arg.Any<UserSecret>(), Arg.Any<string>())
            .Returns(
                new ParatextSettings
                {
                    ProjectType = newProjectType,
                    BaseProjectParatextId = newBaseProjectParatextId,
                    BaseProjectShortName = newBaseProjectShortName,
                    CopyrightBanner = null,
                    CopyrightNotice = null,
                }
            );
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);
        project = env.VerifyProjectSync(true);
        Assert.That(project.TranslateConfig.ProjectType, Is.EqualTo(newProjectType));
        Assert.That(project.TranslateConfig.BaseProject.ParatextId, Is.EqualTo(newBaseProjectParatextId));
        Assert.That(project.TranslateConfig.BaseProject.ShortName, Is.EqualTo(newBaseProjectShortName));
        Assert.That(project.CopyrightBanner, Is.Null);
        Assert.That(project.CopyrightNotice, Is.Null);

        // Remove the base project configuration
        newProjectType = ProjectType.Standard.ToString();
        newBaseProjectParatextId = null;
        newBaseProjectShortName = string.Empty;
        env.ParatextService.GetParatextSettings(Arg.Any<UserSecret>(), Arg.Any<string>())
            .Returns(
                new ParatextSettings
                {
                    ProjectType = newProjectType,
                    BaseProjectParatextId = newBaseProjectParatextId,
                    BaseProjectShortName = newBaseProjectShortName,
                }
            );
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);
        project = env.VerifyProjectSync(true);
        Assert.That(project.TranslateConfig.ProjectType, Is.EqualTo(newProjectType));
        Assert.IsNull(project.TranslateConfig.BaseProject);
    }

    [Test]
    public async Task SyncAsync_ProjectSettingsIsNull_SyncFailsAndTextNotUpdated()
    {
        var env = new TestEnvironment();
        Book[] books = [new Book("MAT", 1)];
        env.SetupSFData(true, true, true, false, books);
        env.SetupPTData(books);

        var ptUserRoles = new Dictionary<string, string> { { "pt01", SFProjectRole.Administrator } };
        env.ParatextService.GetParatextUsersAsync(
                Arg.Any<UserSecret>(),
                Arg.Is((SFProject project) => project.ParatextId == "target"),
                Arg.Any<CancellationToken>()
            )
            .Returns([TestEnvironment.ParatextProjectUser01]);
        env.ParatextService.GetParatextSettings(Arg.Any<UserSecret>(), Arg.Any<string>()).Returns(x => null);

        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);
        env.VerifyProjectSync(false);
        await env.ParatextService.DidNotReceiveWithAnyArgs().PutBookText(default, default, default, default, default);

        // Check that the failure was logged in the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Status, Is.EqualTo(SyncStatus.Failed));
    }

    [Test]
    public async Task SyncAsync_CheckerWithPTAccountNotRemoved()
    {
        var env = new TestEnvironment();
        Book[] books = [new Book("MAT", 2), new Book("MRK", 2)];
        env.SetupSFData(true, true, false, false, books);
        env.SetupPTData(books);
        env.ParatextService.GetParatextUsersAsync(
                Arg.Any<UserSecret>(),
                Arg.Is((SFProject project) => project.ParatextId == "target"),
                Arg.Any<CancellationToken>()
            )
            .Returns([TestEnvironment.ParatextProjectUser01]);

        await env.SetUserRole("user02", SFProjectRole.CommunityChecker);
        SFProject project = env.GetProject();
        Assert.That(project.UserRoles["user02"], Is.EqualTo(SFProjectRole.CommunityChecker));
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        env.VerifyProjectSync(true);
        await env.SFProjectService.DidNotReceiveWithAnyArgs().RemoveUserAsync("user01", "project01", "user02");

        // Verify the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Users, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 0)));
    }

    [Test]
    public async Task SyncAsync_LanguageIsRightToLeft_ProjectPropertySet()
    {
        var env = new TestEnvironment();
        Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
        env.SetupSFData(true, false, false, false, books);
        env.SetupPTData(books);

        env.ParatextService.GetParatextSettings(Arg.Any<UserSecret>(), "target")
            .Returns(new ParatextSettings { IsRightToLeft = true });
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        SFProject project = env.GetProject();
        env.ParatextService.Received().GetParatextSettings(Arg.Any<UserSecret>(), "target");
        env.ParatextService.Received().GetParatextSettings(Arg.Any<UserSecret>(), "source");
        Assert.That(project.IsRightToLeft, Is.True);
        Assert.That(project.TranslateConfig.Source.IsRightToLeft, Is.False);
    }

    [Test]
    public async Task SyncAsync_FullName_ProjectPropertyNotSetIfNull()
    {
        var env = new TestEnvironment();
        Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
        env.SetupSFData(true, false, false, false, books);
        env.SetupPTData(books);

        env.ParatextService.GetParatextSettings(Arg.Any<UserSecret>(), "target").Returns(new ParatextSettings());

        // SUT
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        SFProject project = env.GetProject();
        env.ParatextService.Received().GetParatextSettings(Arg.Any<UserSecret>(), "target");
        Assert.That(project.Name, Is.EqualTo("project01"));
    }

    [Test]
    public async Task SyncAsync_FullName_ProjectPropertySet()
    {
        var env = new TestEnvironment();
        Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
        env.SetupSFData(true, false, false, false, books);
        env.SetupPTData(books);

        string newFullName = "New Full Name";
        env.ParatextService.GetParatextSettings(Arg.Any<UserSecret>(), "target")
            .Returns(new ParatextSettings { FullName = newFullName });

        // SUT
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        SFProject project = env.GetProject();
        env.ParatextService.Received().GetParatextSettings(Arg.Any<UserSecret>(), "target");
        Assert.That(project.Name, Is.EqualTo(newFullName));
    }

    [Test]
    public async Task SyncAsync_TextDocAlreadyExists()
    {
        var env = new TestEnvironment();
        env.SetupSFData(false, false, false, false, new Book("MAT", 2), new Book("MRK", 2));
        env.RealtimeService.GetRepository<TextData>()
            .Add(new TextData(Delta.New().InsertText("old text")) { Id = TextData.GetTextDocId("project01", 42, 1) });
        env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2), new Book("LUK", 2));

        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        var delta = Delta.New().InsertText("text");
        Assert.That(env.GetText("project01", "MAT", 1).DeepEquals(delta), Is.True);
        Assert.That(env.GetText("project01", "MAT", 2).DeepEquals(delta), Is.True);
        Assert.That(env.GetText("project01", "MRK", 1).DeepEquals(delta), Is.True);
        Assert.That(env.GetText("project01", "MRK", 2).DeepEquals(delta), Is.True);
        Assert.That(env.GetText("project01", "LUK", 1).DeepEquals(delta), Is.True);
        Assert.That(env.GetText("project01", "LUK", 2).DeepEquals(delta), Is.True);
        env.VerifyProjectSync(true);

        // Verify the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.TextDocs, Is.EqualTo(new SyncMetricInfo(added: 2, deleted: 0, updated: 0)));
        syncMetrics = env.GetSyncMetrics("project02");
        Assert.That(syncMetrics.TextDocs, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 0)));
    }

    [Test]
    public async Task SyncAsync_DbMissingChapter()
    {
        // The project in the DB has a book, but a Source chapter is missing from that book.
        var env = new TestEnvironment();
        env.SetupSFData(true, true, false, false, new Book("MAT", 3, 3) { MissingSourceChapters = { 2 } });
        env.SetupPTData(new Book("MAT", 3, true));

        // DB should start with Target chapter 2 but without Source chapter 2.
        Assert.That(env.ContainsText("project01", "MAT", 2), Is.True);
        Assert.That(env.ContainsText("project02", "MAT", 2), Is.False);

        // SUT
        await env.Runner.RunAsync("project02", "user01", "project02", false, CancellationToken.None);
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        // No errors or exceptions were logged
        env.MockLogger.AssertNoEvent(
            (LogEvent logEvent) => logEvent.LogLevel == LogLevel.Error || logEvent.Exception != null
        );

        var chapterContent = Delta.New().InsertText("text");
        // DB should contain Source chapter 2 now from Paratext.
        Assert.That(env.ContainsText("project01", "MAT", 2), Is.True);
        Assert.That(env.ContainsText("project02", "MAT", 2), Is.True);
        Assert.That(env.GetText("project01", "MAT", 2).DeepEquals(chapterContent), Is.True);
        Assert.That(env.GetText("project02", "MAT", 2).DeepEquals(chapterContent), Is.True);

        // Verify the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.TextDocs, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 0)));
        syncMetrics = env.GetSyncMetrics("project02");
        Assert.That(syncMetrics.TextDocs, Is.EqualTo(new SyncMetricInfo(added: 1, deleted: 0, updated: 0)));
    }

    [Test]
    public async Task SyncAsync_ParatextMissingChapter()
    {
        // The project in Paratext has a book, but a chapter is missing from that book.
        var env = new TestEnvironment();
        env.SetupSFData(true, true, false, false, new Book("MAT", 3, true));
        env.SetupPTData(new Book("MAT", 3, 3) { MissingTargetChapters = { 2 }, MissingSourceChapters = { 2 } });

        var chapterContent = Delta.New().InsertText("text");
        Assert.That(env.ContainsText("project01", "MAT", 1), Is.True);
        Assert.That(env.ContainsText("project02", "MAT", 1), Is.True);
        // DB should start with a chapter 2.
        Assert.That(env.ContainsText("project01", "MAT", 2), Is.True);
        Assert.That(env.ContainsText("project02", "MAT", 2), Is.True);
        Assert.That(env.GetText("project01", "MAT", 2).DeepEquals(chapterContent), Is.True);
        Assert.That(env.GetText("project02", "MAT", 2).DeepEquals(chapterContent), Is.True);
        Assert.That(env.ContainsText("project01", "MAT", 3), Is.True);
        Assert.That(env.ContainsText("project02", "MAT", 3), Is.True);

        // SUT
        await env.Runner.RunAsync("project02", "user01", "project02", false, CancellationToken.None);
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        // No errors or exceptions were logged
        env.MockLogger.AssertNoEvent(
            (LogEvent logEvent) => logEvent.LogLevel == LogLevel.Error || logEvent.Exception != null
        );

        // DB should now be missing chapter 2, but retain chapters 1 and 3.
        Assert.That(env.ContainsText("project01", "MAT", 1), Is.True);
        Assert.That(env.ContainsText("project02", "MAT", 1), Is.True);
        Assert.That(env.ContainsText("project01", "MAT", 2), Is.False);
        Assert.That(env.ContainsText("project02", "MAT", 2), Is.False);
        Assert.That(env.ContainsText("project01", "MAT", 3), Is.True);
        Assert.That(env.ContainsText("project02", "MAT", 3), Is.True);

        // Verify the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.TextDocs, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 1, updated: 0)));
        syncMetrics = env.GetSyncMetrics("project02");
        Assert.That(syncMetrics.TextDocs, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 1, updated: 0)));
    }

    [Test]
    public async Task SyncAsync_DbAndParatextMissingChapter()
    {
        // The project has a book, but a Source chapter is missing from that book. Both in the DB and in Paratext.
        var env = new TestEnvironment();
        env.SetupSFData(true, true, false, false, new Book("MAT", 3, 3) { MissingSourceChapters = { 2 } });
        env.SetupPTData(new Book("MAT", 3, 3) { MissingSourceChapters = { 2 } });

        // DB should start without Source chapter 2.
        Assert.That(env.ContainsText("project01", "MAT", 2), Is.True);
        Assert.That(env.ContainsText("project02", "MAT", 2), Is.False);

        // SUT
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        // No errors or exceptions were logged
        env.MockLogger.AssertNoEvent(
            (LogEvent logEvent) => logEvent.LogLevel == LogLevel.Error || logEvent.Exception != null
        );

        // DB should still be missing Source chapter 2.
        Assert.That(env.ContainsText("project01", "MAT", 2), Is.True);
        Assert.That(env.ContainsText("project02", "MAT", 2), Is.False);

        // Verify the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.TextDocs, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 0)));
        syncMetrics = env.GetSyncMetrics("project02");
        Assert.That(syncMetrics.TextDocs, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 0)));
    }

    [Test]
    public async Task SyncAsync_ParatextMissingAllChapters()
    {
        // The project in PT has a book, but no chapters.
        var env = new TestEnvironment();
        env.SetupSFData(true, true, false, false, new Book("MAT", 3, true));
        env.SetupPTData(new Book("MAT", 0, true));

        var chapterContent = Delta.New().InsertText("text");
        Assert.That(env.ContainsText("project01", "MAT", 1), Is.True);
        Assert.That(env.ContainsText("project02", "MAT", 1), Is.True);
        Assert.That(env.ContainsText("project01", "MAT", 2), Is.True);
        Assert.That(env.ContainsText("project02", "MAT", 2), Is.True);
        Assert.That(env.GetText("project01", "MAT", 2).DeepEquals(chapterContent), Is.True);
        Assert.That(env.GetText("project02", "MAT", 2).DeepEquals(chapterContent), Is.True);
        Assert.That(env.ContainsText("project01", "MAT", 3), Is.True);
        Assert.That(env.ContainsText("project02", "MAT", 3), Is.True);

        // SUT
        await env.Runner.RunAsync("project02", "user01", "project02", false, CancellationToken.None);
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        // No errors or exceptions were logged
        env.MockLogger.AssertNoEvent(
            (LogEvent logEvent) => logEvent.LogLevel == LogLevel.Error || logEvent.Exception != null
        );

        // DB should now be missing all chapters except for the first, implicit chapter.
        Assert.That(env.ContainsText("project01", "MAT", 1), Is.True);
        Assert.That(env.ContainsText("project02", "MAT", 1), Is.True);
        Assert.That(env.ContainsText("project01", "MAT", 2), Is.False);
        Assert.That(env.ContainsText("project02", "MAT", 2), Is.False);
        Assert.That(env.ContainsText("project01", "MAT", 3), Is.False);
        Assert.That(env.ContainsText("project02", "MAT", 3), Is.False);

        // Verify the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.TextDocs, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 2, updated: 1)));
        syncMetrics = env.GetSyncMetrics("project02");
        Assert.That(syncMetrics.TextDocs, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 2, updated: 1)));
    }

    [Test]
    public async Task RunAsync_NoRecordOfSyncedToRepositoryVersion_DoesFullSync()
    {
        var env = new TestEnvironment();
        string projectSFId = "project03";
        string userId = "user01";

        SFProject project = env.SetupProjectWithExpectedImportedRev(projectSFId, null);
        Assert.That(project.Sync.DataInSync, Is.Null, "setup. Should be testing what happens when this is null.");
        string projectPTId = project.ParatextId;
        env.ParatextService.GetLatestSharedVersion(Arg.Any<UserSecret>(), projectPTId).Returns("1", "2");
        // The expected after-sync repository version can be past the original, before-sync project version,
        // even if there were no local changes, since there may be incoming changes from the PT Archives server.
        string expectedRepositoryVersion = "2";
        // SUT
        await env.RunAndAssertContinuesAsync(projectSFId, userId, expectedRepositoryVersion);
        // Shouldn't be setting repo rev.
        env.ParatextService.DidNotReceive()
            .SetRepoToRevision(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<string>());
    }

    [Test]
    public async Task RunAsync_NullSyncRevRecordMatchesNullHgRev_Continue()
    {
        // The project sync record has no recorded PT hg repo revision that it imported from.
        // The hg repo gives no revision either. Continue with sync.

        var env = new TestEnvironment();
        // project05 has a null DB SyncedToRepositoryVersion.
        string projectSFId = "project05";
        string userId = "user01";
        SFProject project = env.SetupProjectWithExpectedImportedRev(
            projectSFId,
            startingDBSyncedToRepositoryVersion: null
        );
        env.ParatextService.GetLatestSharedVersion(Arg.Any<UserSecret>(), project.ParatextId).Returns(default(string?));
        Assert.That(
            project.Sync.DataInSync,
            Is.Not.Null,
            "setup. We are not testing the special situation of DataInSync being null."
        );
        // SUT
        await env.RunAndAssertContinuesAsync(projectSFId, userId, finalDBSyncedToRepositoryVersion: null);
        // Shouldn't be setting repo rev.
        env.ParatextService.DidNotReceive()
            .SetRepoToRevision(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<string>());
    }

    [Test]
    public async Task RunAsync_NullSyncRevRecordNotMatchHgRev_Continue()
    {
        // The project sync record has no recorded PT hg repo revision that it imported from,
        // yet the hg repo is there and has a revision. Continue with sync.

        var env = new TestEnvironment();
        // project05 has a null DB SyncedToRepositoryVersion.
        string projectSFId = "project05";
        string userId = "user01";
        SFProject project = env.SetupProjectWithExpectedImportedRev(
            projectSFId,
            startingDBSyncedToRepositoryVersion: null
        );
        env.ParatextService.GetLatestSharedVersion(Arg.Any<UserSecret>(), project.ParatextId).Returns("v1");
        Assert.That(
            project.Sync.DataInSync,
            Is.Not.Null,
            "setup. We are not testing the special situation of DataInSync being null."
        );
        // SUT
        await env.RunAndAssertContinuesAsync(projectSFId, userId, finalDBSyncedToRepositoryVersion: "v1");
        // Shouldn't be setting repo rev.
        env.ParatextService.DidNotReceive()
            .SetRepoToRevision(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<string>());
    }

    [Test]
    public async Task RunAsync_SyncRevRecordNotMatchHgRev_AdjustAndContinue()
    {
        // The project sync record of PT hg repo revision that it imported from does not match the current
        // hg repo revision. So we set the repo revision, and perform sync.

        var env = new TestEnvironment();
        // project01 has a non-null DB SyncedToRepositoryVersion.
        string projectSFId = "project01";
        string userId = "user01";
        SFProject project = env.SetupProjectWithExpectedImportedRev(
            projectSFId,
            startingDBSyncedToRepositoryVersion: "beforeSR"
        );
        env.ParatextService.GetLatestSharedVersion(Arg.Any<UserSecret>(), project.ParatextId).Returns("v1");
        // SUT
        await env.RunAndAssertContinuesAsync(projectSFId, userId, finalDBSyncedToRepositoryVersion: "afterSR");
        env.ParatextService.Received().SetRepoToRevision(Arg.Any<UserSecret>(), Arg.Any<string>(), "beforeSR");
    }

    [Test]
    public async Task RunAsync_SyncRevRecordMatchesHgRev_Continue()
    {
        // The project sync record of PT hg repo revision that it imported from matches the current
        // hg repo revision. Continue with sync.

        var env = new TestEnvironment();
        // project01 has a non-null DB SyncedToRepositoryVersion.
        string projectSFId = "project01";
        string userId = "user01";
        SFProject project = env.SetupProjectWithExpectedImportedRev(
            projectSFId,
            startingDBSyncedToRepositoryVersion: "beforeSR"
        );
        env.ParatextService.GetLatestSharedVersion(Arg.Any<UserSecret>(), project.ParatextId).Returns(("beforeSR"));
        // SUT
        await env.RunAndAssertContinuesAsync(projectSFId, userId, finalDBSyncedToRepositoryVersion: "afterSR");
        // And it doesn't matter if we set the hg repo to the rev or not.
    }

    [Test]
    public async Task SyncAsync_TaskAbortedByExceptionWritesToLog()
    {
        // Set up the environment
        var env = new TestEnvironment();
        env.SetupSFData(true, true, false, false);
        env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2));
        using var cancellationTokenSource = new CancellationTokenSource();

        // Setup a trap to crash the task
        env.NotesMapper.When(x => x.Init(Arg.Any<UserSecret>(), Arg.Any<IReadOnlyList<ParatextProjectUser>>()))
            .Do(_ => throw new ArgumentException());

        // Run the task
        await env.Runner.RunAsync("project01", "user01", "project01", false, cancellationTokenSource.Token);

        // Check that the Exception was logged
        env.MockLogger.AssertHasEvent((LogEvent logEvent) => logEvent.Exception != null);

        // Check that the exception was logged in the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Status, Is.EqualTo(SyncStatus.Failed));
        StringAssert.StartsWith("System.ArgumentException", syncMetrics.ErrorDetails);

        // Check that the task cancelled correctly
        SFProject project = env.VerifyProjectSync(false);
        Assert.That(project.Sync.DataInSync, Is.True); // Nothing was synced as this was cancelled OnInit()
    }

    [Test]
    public async Task SyncAsync_DataInSyncTrueAfterRestore()
    {
        var env = new TestEnvironment();
        env.SetupSFData(true, true, false, false);
        env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2));
        // Simulate a successful backup to a hg repo at a revision not matching our project doc
        // after a failed send/receive
        env.ParatextService.BackupExists(Arg.Any<UserSecret>(), Arg.Any<string>()).Returns(true);
        env.ParatextService.RestoreRepository(Arg.Any<UserSecret>(), Arg.Any<string>()).Returns(true);
        env.ParatextService.When(p => p.GetBookText(Arg.Any<UserSecret>(), "target", Arg.Any<int>()))
            .Do(_ => throw new ArgumentException());

        env.ParatextService.When(p => p.RestoreRepository(Arg.Any<UserSecret>(), "target"))
            .Do(_ =>
                env.ParatextService.GetLatestSharedVersion(Arg.Any<UserSecret>(), "target")
                    .Returns("revNotMatchingVersion")
            );

        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        // Check that the failure was logged in the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Status, Is.EqualTo(SyncStatus.Failed));
        Assert.That(syncMetrics.RepositoryRestoredFromBackup, Is.True);

        // Check that the sync restored correctly
        env.ParatextService.Received(1).RestoreRepository(Arg.Any<UserSecret>(), "target");
        SFProject project = env.VerifyProjectSync(false);
        Assert.That(project.Sync.DataInSync, Is.True);
    }

    [Test]
    public async Task SyncAsync_TaskCancelledByException()
    {
        // Set up the environment
        var env = new TestEnvironment();
        env.SetupSFData(true, true, false, false);
        env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2));
        using var cancellationTokenSource = new CancellationTokenSource();

        // Setup a trap to cancel the task
        env.NotesMapper.When(x => x.Init(Arg.Any<UserSecret>(), Arg.Any<IReadOnlyList<ParatextProjectUser>>()))
            .Do(_ =>
            {
                cancellationTokenSource.Cancel();
                throw new TaskCanceledException();
            });

        // Run the task
        await env.Runner.RunAsync("project01", "user01", "project01", false, cancellationTokenSource.Token);

        // The TaskCancelledException was not logged
        Assert.That(
            env.MockLogger.LogEvents.Count(
                (LogEvent logEvent) => logEvent.LogLevel == LogLevel.Error || logEvent.Exception != null
            ),
            Is.EqualTo(0)
        );

        // Check that the cancellation was logged in the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Status, Is.EqualTo(SyncStatus.Cancelled));

        // Check that the task cancelled correctly
        SFProject project = env.VerifyProjectSync(false);
        Assert.That(project.Sync.DataInSync, Is.True); // Nothing was synced as this was cancelled OnInit()
    }

    [Test]
    public async Task SyncAsync_TaskCancelledMidway()
    {
        // Set up the environment
        var env = new TestEnvironment();
        env.SetupSFData(true, true, false, false);
        env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2));
        using var cancellationTokenSource = new CancellationTokenSource();

        // Setup a trap to cancel the task
        env.ParatextService.When(x =>
                x.SendReceiveAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Any<string>(),
                    Arg.Any<IProgress<ProgressState>>(),
                    Arg.Any<CancellationToken>(),
                    Arg.Any<SyncMetrics>()
                )
            )
            .Do(_ => cancellationTokenSource.Cancel());

        // Run the task
        await env.Runner.RunAsync("project01", "user01", "project01", false, cancellationTokenSource.Token);

        // Check that the cancellation was logged in the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Status, Is.EqualTo(SyncStatus.Cancelled));

        // Check that the task cancelled correctly
        SFProject project = env.VerifyProjectSync(false);
        Assert.That(project.Sync.DataInSync, Is.False);
    }

    [Test]
    public async Task SyncAsync_TaskCancelledAndRestoreFails_DataNotInSync()
    {
        var env = new TestEnvironment();
        env.SetupSFData(true, false, true, false);
        env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2));
        using var cancellationTokenSource = new CancellationTokenSource();
        env.ParatextService.BackupExists(Arg.Any<UserSecret>(), Arg.Any<string>()).Returns(true);
        env.ParatextService.RestoreRepository(Arg.Any<UserSecret>(), Arg.Any<string>()).Returns(false);

        env.ParatextService.When(x =>
                x.SendReceiveAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Any<string>(),
                    Arg.Any<IProgress<ProgressState>>(),
                    Arg.Any<CancellationToken>(),
                    Arg.Any<SyncMetrics>()
                )
            )
            .Do(_ => cancellationTokenSource.Cancel());
        await env.Runner.RunAsync("project01", "user01", "project01", false, cancellationTokenSource.Token);
        env.ParatextService.Received(1).RestoreRepository(Arg.Any<UserSecret>(), Arg.Any<string>());
        SFProject project = env.VerifyProjectSync(false);

        // Check that the cancellation was logged in the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Status, Is.EqualTo(SyncStatus.Cancelled));

        // Data is out of sync due to the failed restore
        Assert.That(project.Sync.DataInSync, Is.False);
    }

    [Test]
    public async Task SyncAsync_TaskCancelledPrematurely()
    {
        // Set up the environment
        var env = new TestEnvironment();
        env.SetupSFData(true, true, false, false);
        env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2));
        using var cancellationTokenSource = new CancellationTokenSource();

        // Cancel the token before awaiting the task
        cancellationTokenSource.Cancel();

        // Run the task
        await env.Runner.RunAsync("project01", "user01", "project01", false, cancellationTokenSource.Token);

        // Check that the cancellation was logged in the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Status, Is.EqualTo(SyncStatus.Cancelled));

        // Check that the task was cancelled after awaiting the check above
        SFProject project = env.VerifyProjectSync(false);
        Assert.That(project.Sync.DataInSync, Is.True);
    }

    [Test]
    public async Task SyncAsync_TaskCancelledExecutesRollback()
    {
        // Set up the environment
        var env = new TestEnvironment(substituteRealtimeService: true);
        env.SetupSFData(true, true, false, false);
        env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2));
        using var cancellationTokenSource = new CancellationTokenSource();

        // Return the project so InitAsync will execute successfully
        var project = Substitute.For<IDocument<SFProject>>();
        project.IsLoaded.Returns(true);
        project.Data.Returns(env.GetProject());
        env.Connection.Get<SFProject>("project01").Returns(project);

        // Setup a trap to cancel the task
        env.ParatextService.When(x =>
                x.SendReceiveAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Any<string>(),
                    Arg.Any<IProgress<ProgressState>>(),
                    Arg.Any<CancellationToken>(),
                    Arg.Any<SyncMetrics>()
                )
            )
            .Do(_ => cancellationTokenSource.Cancel());

        // Run the task
        await env.Runner.RunAsync("project01", "user01", "project01", false, cancellationTokenSource.Token);

        // Check for RollbackTransaction being executed, to ensure
        // that CompleteAsync executes to the end without exception
        env.Connection.Received(1).RollbackTransaction();

        // Check that the cancellation was logged in the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Status, Is.EqualTo(SyncStatus.Cancelled));
    }

    [Test]
    public async Task SyncAsync_ExcludesPropertiesFromTransactions()
    {
        // Set up the environment
        var env = new TestEnvironment(substituteRealtimeService: true);
        env.SetupSFData(true, true, false, false);
        env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2));
        using var cancellationTokenSource = new CancellationTokenSource();

        // Throw an TaskCanceledException in InitAsync after the exclusions have been called
        // InitAsync calls the IConnection.FetchAsync() extension, which calls IConnection.Get()
        env.Connection.Get<SFProject>("project01").Throws(new TaskCanceledException());

        // Run the task
        await env.Runner.RunAsync("project01", "user01", "project01", false, cancellationTokenSource.Token);

        // Only check for ExcludePropertyFromTransaction being executed,
        // as the substitute RealtimeService will not update documents.
        env.Connection.Received(1)
            .ExcludePropertyFromTransaction(
                Arg.Is<Expression<Func<SFProject, object>>>(ex =>
                    string.Join('.', new ObjectPath(ex).Items) == "Sync.QueuedCount"
                )
            );
        env.Connection.Received(1)
            .ExcludePropertyFromTransaction(
                Arg.Is<Expression<Func<SFProject, object>>>(ex =>
                    string.Join('.', new ObjectPath(ex).Items) == "Sync.DataInSync"
                )
            );
        env.Connection.Received(1)
            .ExcludePropertyFromTransaction(
                Arg.Is<Expression<Func<SFProject, object>>>(ex =>
                    string.Join('.', new ObjectPath(ex).Items) == "Sync.LastSyncSuccessful"
                )
            );
        env.Connection.Received(3).ExcludePropertyFromTransaction(Arg.Any<Expression<Func<SFProject, object>>>());
    }

    [Test]
    public async Task SyncAsync_TaskCancelledTooLate()
    {
        // Set up the environment
        var env = new TestEnvironment();
        env.SetupSFData(true, true, false, false);
        env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2));
        using var cancellationTokenSource = new CancellationTokenSource();

        // Run the task
        await env.Runner.RunAsync("project01", "user01", "project01", false, cancellationTokenSource.Token);

        // Cancel the token after awaiting the task
        cancellationTokenSource.Cancel();

        // Check that the sync was successful
        SFProject project = env.VerifyProjectSync(true);
        Assert.That(project.Sync.DataInSync, Is.True);
    }

    [Test]
    public async Task GetChapterAuthors_FromMongoDB()
    {
        // Setup
        // Note that the last modified userId is set to user05
        // So the user id will be retrieved from GetLastModifiedUserIdAsync()
        // But note that user05 must also be in the chapter permissions to be used
        var env = new TestEnvironment();
        TextInfo textInfo = env.SetupChapterAuthorsAndGetTextInfo(setChapterPermissions: false);
        await env.Runner.InitAsync("project01", "user01", "project01", CancellationToken.None);
        var textDocs = await env.FetchTextDocsAsync(textInfo);
        textInfo.Chapters.First().Permissions.Add("user05", TextInfoPermission.Write);
        env.RealtimeService.LastModifiedUserId = "user05";

        // SUT
        Dictionary<int, string> chapterAuthors = await env.Runner.GetChapterAuthorsAsync(textInfo, textDocs);
        Assert.AreEqual(1, chapterAuthors.Count);
        Assert.AreEqual(new KeyValuePair<int, string>(1, "user05"), chapterAuthors.First());
    }

    [Test]
    public async Task GetChapterAuthors_FromUserSecret()
    {
        // Setup
        // Note that the InitAsync() userId is user01, and setChapterPermissions is true,
        // So the user id will be retrieved from the user secret
        var env = new TestEnvironment();
        TextInfo textInfo = env.SetupChapterAuthorsAndGetTextInfo(setChapterPermissions: true);
        await env.Runner.InitAsync("project01", "user01", "project01", CancellationToken.None);
        var textDocs = await env.FetchTextDocsAsync(textInfo);

        // SUT
        Dictionary<int, string> chapterAuthors = await env.Runner.GetChapterAuthorsAsync(textInfo, textDocs);
        Assert.AreEqual(1, chapterAuthors.Count);
        Assert.AreEqual(new KeyValuePair<int, string>(1, "user01"), chapterAuthors.First());
    }

    [Test]
    public async Task GetChapterAuthors_FromChapterPermissions()
    {
        // Setup
        // Note that the InitAsync() userId is user02, and setChapterPermissions is true,
        // So the user id will be retrieved from the chapter permissions
        var env = new TestEnvironment();
        TextInfo textInfo = env.SetupChapterAuthorsAndGetTextInfo(setChapterPermissions: true);
        await env.Runner.InitAsync("project01", "user02", "project01", CancellationToken.None);
        var textDocs = await env.FetchTextDocsAsync(textInfo);

        // SUT
        Dictionary<int, string> chapterAuthors = await env.Runner.GetChapterAuthorsAsync(textInfo, textDocs);
        Assert.AreEqual(1, chapterAuthors.Count);
        Assert.AreEqual(new KeyValuePair<int, string>(1, "user01"), chapterAuthors.First());
    }

    [Test]
    public async Task GetChapterAuthors_FromProjectDoc()
    {
        // Setup
        // Note that the InitAsync() userId is user02, and setChapterPermissions is false,
        // So the user id will be retrieved from the project doc
        var env = new TestEnvironment();
        TextInfo textInfo = env.SetupChapterAuthorsAndGetTextInfo(setChapterPermissions: false);
        await env.Runner.InitAsync("project01", "user02", "project01", CancellationToken.None);
        var textDocs = await env.FetchTextDocsAsync(textInfo);

        // SUT
        Dictionary<int, string> chapterAuthors = await env.Runner.GetChapterAuthorsAsync(textInfo, textDocs);
        Assert.AreEqual(1, chapterAuthors.Count);
        Assert.AreEqual(new KeyValuePair<int, string>(1, "user03"), chapterAuthors.First());
    }

    [Test]
    public async Task GetChapterAuthors_ChecksLastModifiedUserPermission()
    {
        // Setup
        // Note that the last modified userId is set to user06
        // So the user id will be retrieved from GetLastModifiedUserIdAsync()
        // But will not pass the chapter permissions test (only user05 has permission)
        var env = new TestEnvironment();
        TextInfo textInfo = env.SetupChapterAuthorsAndGetTextInfo(setChapterPermissions: false);
        await env.Runner.InitAsync("project01", "user01", "project01", CancellationToken.None);
        var textDocs = await env.FetchTextDocsAsync(textInfo);
        textInfo.Chapters.First().Permissions.Add("user05", TextInfoPermission.Write);
        env.RealtimeService.LastModifiedUserId = "user06";

        // SUT
        Dictionary<int, string> chapterAuthors = await env.Runner.GetChapterAuthorsAsync(textInfo, textDocs);
        Assert.AreEqual(1, chapterAuthors.Count);
        Assert.AreEqual(new KeyValuePair<int, string>(1, "user05"), chapterAuthors.First());
    }

    [Test]
    public async Task GetChapterAuthors_ChecksLastModifiedUserWritePermission()
    {
        // Setup
        // Note that the last modified userId is set to user05
        // So the user id will be retrieved from GetLastModifiedUserIdAsync()
        // But will not pass the chapter permissions test (user05 can only read)
        // However, user03 will be used because they are the project administrator
        var env = new TestEnvironment();
        TextInfo textInfo = env.SetupChapterAuthorsAndGetTextInfo(setChapterPermissions: false);
        await env.Runner.InitAsync("project01", "user01", "project01", CancellationToken.None);
        var textDocs = await env.FetchTextDocsAsync(textInfo);
        textInfo.Chapters.First().Permissions.Add("user05", TextInfoPermission.Read);
        env.RealtimeService.LastModifiedUserId = "user05";

        // SUT
        Dictionary<int, string> chapterAuthors = await env.Runner.GetChapterAuthorsAsync(textInfo, textDocs);
        Assert.AreEqual(1, chapterAuthors.Count);
        Assert.AreEqual(new KeyValuePair<int, string>(1, "user03"), chapterAuthors.First());
    }

    [Test]
    public async Task SyncAsync_UpdatesParatextComments()
    {
        var env = new TestEnvironment();
        var book = new Book("MAT", 1, true);
        env.SetupSFData(true, false, false, true, book);
        env.SetupPTData(book);
        string dataId = "dataId01";
        env.SetupNoteChanges(dataId, "thread01", "MAT 1:1", false);
        SyncMetricInfo info = new SyncMetricInfo(0, 0, 1);
        env.ParatextService.UpdateParatextCommentsAsync(
                Arg.Any<UserSecret>(),
                "target",
                Arg.Any<IEnumerable<IDocument<NoteThread>>>(),
                Arg.Any<Dictionary<string, string>>(),
                Arg.Any<Dictionary<string, ParatextUserProfile>>(),
                Arg.Any<int>()
            )
            .Returns(Task.FromResult(info));

        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);
        await env
            .ParatextService.Received(1)
            .UpdateParatextCommentsAsync(
                Arg.Any<UserSecret>(),
                "target",
                Arg.Is<IEnumerable<IDocument<NoteThread>>>(t => t.Count() == 1 && t.First().Id == "project01:dataId01"),
                Arg.Any<Dictionary<string, string>>(),
                Arg.Any<Dictionary<string, ParatextUserProfile>>(),
                Arg.Any<int>()
            );

        SFProject project = env.GetProject();
        Assert.That(project.ParatextUsers.Select(u => u.Username), Is.EquivalentTo(new[] { "User 1", "User 2" }));
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.ParatextNotes, Is.EqualTo(info));
    }

    [Test]
    public async Task SyncAsync_AddParatextComments()
    {
        var env = new TestEnvironment();
        var book = new Book("MAT", 1, true);
        env.SetupSFData(true, false, false, true, book);
        env.SetupPTData(book);
        Book[] books = new[] { book };
        env.AddParatextNoteThreadData(books, true, true);
        SyncMetricInfo info = new SyncMetricInfo(1, 0, 0);
        env.ParatextService.UpdateParatextCommentsAsync(
                Arg.Any<UserSecret>(),
                "target",
                Arg.Any<IEnumerable<IDocument<NoteThread>>>(),
                Arg.Any<Dictionary<string, string>>(),
                Arg.Any<Dictionary<string, ParatextUserProfile>>(),
                Arg.Any<int>()
            )
            .Returns(Task.FromResult(info));

        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);
        await env
            .ParatextService.Received(1)
            .UpdateParatextCommentsAsync(
                Arg.Any<UserSecret>(),
                "target",
                Arg.Is<IEnumerable<IDocument<NoteThread>>>(t => t.Single().Id == "project01:dataId01"),
                Arg.Any<Dictionary<string, string>>(),
                Arg.Any<Dictionary<string, ParatextUserProfile>>(),
                Arg.Any<int>()
            );

        env.ParatextService.Received(1)
            .GetNoteThreadChanges(
                Arg.Any<UserSecret>(),
                "target",
                40,
                Arg.Is<IEnumerable<IDocument<NoteThread>>>(t => t.Single().Data.Notes.All(n => n.OwnerRef == "user03")),
                Arg.Any<Dictionary<int, ChapterDelta>>(),
                Arg.Any<Dictionary<string, ParatextUserProfile>>()
            );
        SFProject project = env.GetProject();
        NoteThread noteThread = env.GetNoteThread("project01", "dataId01");
        Assert.That(noteThread.Notes[0].OwnerRef, Is.EqualTo("user03"));
        Assert.That(project.ParatextUsers.Select(u => u.Username), Is.EquivalentTo(new[] { "User 1", "User 2" }));
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.ParatextNotes, Is.EqualTo(info));
    }

    [Test]
    public async Task SyncAsync_SavesNewParatextUser()
    {
        var env = new TestEnvironment();
        env.SetupSFData(false, false, false, true);
        env.SetupPTData(new Book("MAT", 1, true));
        SFProject project = env.GetProject();
        Assert.That(project.ParatextUsers.Select(u => u.Username), Is.EquivalentTo(new[] { "User 1", "User 2" }));

        ParatextProjectUser newUser = new ParatextProjectUser
        {
            ParatextId = TestEnvironment.ParatextProjectUser01.ParatextId,
            Username = "New User 1",
            Id = TestEnvironment.ParatextProjectUser01.Id,
            Role = TestEnvironment.ParatextProjectUser01.Role
        };
        env.ParatextService.GetParatextUsersAsync(Arg.Any<UserSecret>(), Arg.Any<SFProject>(), CancellationToken.None)
            .Returns([newUser, TestEnvironment.ParatextProjectUser02]);
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);
        project = env.GetProject();
        Assert.That(
            project.ParatextUsers.Select(u => u.Username),
            Is.EquivalentTo(new[] { "User 1", "User 2", "New User 1" })
        );
        Assert.That(project.ParatextUsers.Single(u => u.Username == "New User 1").SFUserId, Is.EqualTo("user01"));
        Assert.That(project.ParatextUsers.Single(u => u.Username == "User 1").SFUserId, Is.EqualTo(null));
    }

    [Test]
    public async Task SyncAsync_UpdatesExistingParatextUser()
    {
        var env = new TestEnvironment();
        env.SetupSFData(false, false, false, true);
        env.SetupPTData(new Book("MAT", 1, true));
        SFProject project = env.GetProject();
        Assert.That(project.ParatextUsers.Select(u => u.Username), Is.EquivalentTo(new[] { "User 1", "User 2" }));

        // simulate user01 has changed name to "User 2" who already has a profile on the project but without an SFUserId
        ParatextProjectUser user2 = new ParatextProjectUser
        {
            ParatextId = TestEnvironment.ParatextProjectUser01.ParatextId,
            Username = "User 2",
            Id = TestEnvironment.ParatextProjectUser01.Id,
            Role = TestEnvironment.ParatextProjectUser01.Role
        };
        env.ParatextService.GetParatextUsersAsync(Arg.Any<UserSecret>(), Arg.Any<SFProject>(), CancellationToken.None)
            .Returns([user2]);
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);
        project = env.GetProject();
        Assert.That(project.ParatextUsers.Select(u => u.Username), Is.EquivalentTo(new[] { "User 1", "User 2" }));
        Assert.That(project.ParatextUsers.Single(u => u.Username == "User 1").SFUserId, Is.EqualTo(null));
        Assert.That(project.ParatextUsers.Single(u => u.Username == "User 2").SFUserId, Is.EqualTo("user01"));
    }

    [Test]
    public async Task SyncAsync_UpdatesParatextNoteThreadDoc()
    {
        var env = new TestEnvironment();
        var book = new Book("MAT", 1, true);
        env.SetupSFData(true, false, false, true, book);
        env.SetupPTData(book);
        string dataId = "dataId01";
        NoteThread thread01Before = env.GetNoteThread("project01", "dataId01");
        int startingNoteCount = 2;
        Assert.That(thread01Before.Notes.Count, Is.EqualTo(startingNoteCount), "setup");
        env.SetupNoteChanges(dataId, "thread01");
        // One note is added. One note is marked as Deleted but not actually removed.
        int expectedNoteCountChange = 1;

        // SUT
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        NoteThread thread01 = env.GetNoteThread("project01", dataId);
        int expectedNoteTagId = 3;
        string threadExpected = "Context before Scripture text in project context after-Start:0-Length:0-MAT 1:1";
        Assert.That(thread01.NoteThreadToString(), Is.EqualTo(threadExpected));
        Assert.That(thread01.Assignment, Is.EqualTo(CommentThread.teamUser));
        env.DeltaUsxMapper.ReceivedWithAnyArgs(1).ToChapterDeltas(default);
        Assert.That(thread01.Notes.Count, Is.EqualTo(startingNoteCount + expectedNoteCountChange));
        Assert.That(thread01.Notes[0].Content, Is.EqualTo("thread01 updated."));
        Assert.That(thread01.Notes[0].Assignment, Is.EqualTo(CommentThread.teamUser));
        Assert.That(thread01.Notes[0].Editable, Is.False);
        Assert.That(thread01.Notes[0].VersionNumber, Is.EqualTo(2));
        Assert.That(thread01.Notes[1].Deleted, Is.True);
        Assert.That(thread01.Notes[2].Content, Is.EqualTo("thread01 added."));
        string expected = "thread01-syncuser03-thread01 added.-tag:" + expectedNoteTagId;
        Assert.That(thread01.Notes[2].NoteToString(), Is.EqualTo(expected));
        Assert.That(thread01.Notes[2].TagId, Is.EqualTo(expectedNoteTagId));
        Assert.That(thread01.Notes[2].OwnerRef, Is.EqualTo("user03"));

        SFProject project = env.GetProject();
        // User 3 was added as a sync user
        Assert.That(
            project.ParatextUsers.Select(u => u.Username),
            Is.EquivalentTo(new[] { "User 1", "User 2", "User 3" })
        );
        Assert.That(project.ParatextUsers.Single(u => u.Username == "User 1").SFUserId, Is.EqualTo("user01"));
        Assert.That(project.ParatextUsers.Single(u => u.Username == "User 2").SFUserId, Is.EqualTo("user02"));
        Assert.That(project.ParatextUsers.Single(u => u.Username == "User 3").SFUserId, Is.EqualTo("user03"));
        Assert.That(project.Sync.QueuedCount, Is.EqualTo(0));
        Assert.That(project.Sync.LastSyncSuccessful, Is.True);

        // Verify the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Status, Is.EqualTo(SyncStatus.Successful));
        Assert.That(
            syncMetrics.Notes,
            Is.EqualTo(new NoteSyncMetricInfo(added: 1, deleted: 1, updated: 1, removed: 0))
        );
        Assert.That(syncMetrics.NoteThreads, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 1)));
    }

    [Test]
    public async Task SyncAsync_ParatextNoteThreadReattached()
    {
        var env = new TestEnvironment();
        var book = new Book("MAT", 1, true);
        env.SetupSFData(true, false, false, true, book);
        env.SetupPTData(book);
        string dataId = "dataId01";
        string threadId = "thread01";
        string verseStr = "MAT 1:5";
        env.SetupNoteReattachedChange(dataId, threadId, verseStr);

        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        NoteThread thread01 = env.GetNoteThread("project01", "dataId01");
        string[] reattachedParts = new[]
        {
            "MAT 1:5",
            "reattach selected text",
            "16",
            "Reattach before ",
            " reattach after."
        };
        string reattached = string.Join(PtxUtils.StringUtils.orcCharacter, reattachedParts);
        string expected = "Context before Scripture text in project context after-" + $"Start:16-Length:22-MAT 1:1";
        Assert.That(thread01.NoteThreadToString(), Is.EqualTo(expected));
        Assert.That(thread01.Notes.Single(n => n.Reattached != null).Reattached, Is.EqualTo(reattached));

        // Verify the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Status, Is.EqualTo(SyncStatus.Successful));
        Assert.That(
            syncMetrics.Notes,
            Is.EqualTo(new NoteSyncMetricInfo(added: 1, deleted: 0, updated: 0, removed: 0))
        );
        Assert.That(syncMetrics.NoteThreads, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 0)));
    }

    [Test]
    public async Task SyncAsync_NewBook_AddParatextNoteThreadDoc()
    {
        var env = new TestEnvironment();
        var book = new Book("MAT", 1);
        env.SetupSFData(false, true, false, false);
        env.SetupPTData(book);

        env.SetupNewNoteThreadChange("thread02", "syncuser01");
        string dataId = "dataId02";
        env.GuidService.NewObjectId().Returns(dataId);
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        SFProject project = env.GetProject();
        Assert.That(project.Sync.LastSyncSuccessful, Is.True);
        env.ParatextService.Received(1)
            .GetNoteThreadChanges(
                Arg.Any<UserSecret>(),
                "target",
                40,
                Arg.Any<IEnumerable<IDocument<NoteThread>>>(),
                Arg.Any<Dictionary<int, ChapterDelta>>(),
                Arg.Any<Dictionary<string, ParatextUserProfile>>()
            );
        NoteThread noteThread = env.GetNoteThread("project01", dataId);
        // The note was created on the newly created book
        Assert.That(noteThread.VerseRef.BookNum, Is.EqualTo(40));
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Status, Is.EqualTo(SyncStatus.Successful));
        Assert.That(syncMetrics.Books, Is.EqualTo(new SyncMetricInfo(added: 1, deleted: 0, updated: 0)));
        Assert.That(syncMetrics.NoteThreads, Is.EqualTo(new SyncMetricInfo(added: 1, deleted: 0, updated: 0)));
    }

    [Test]
    public async Task SyncAsync_AddParatextNoteThreadDoc()
    {
        var env = new TestEnvironment();
        var book = new Book("MAT", 3, true);
        env.SetupSFData(true, false, false, true, book);
        env.SetupPTData(book);
        env.SetupNewNoteThreadChange("thread02", "syncuser01");
        string dataId = "dataId02";
        env.GuidService.NewObjectId().Returns(dataId);

        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        NoteThread thread02 = env.GetNoteThread("project01", dataId);
        string expected = "Context before Scripture text in project context after-" + "Start:0-Length:0-MAT 1:1";
        Assert.That(thread02.NoteThreadToString(), Is.EqualTo(expected));
        Assert.That(thread02.Notes.Count, Is.EqualTo(1));
        Assert.That(thread02.Notes[0].Content, Is.EqualTo("New thread02 added."));
        Assert.That(thread02.Notes[0].OwnerRef, Is.EqualTo("user01"));
        Assert.That(thread02.Notes[0].Assignment, Is.EqualTo(CommentThread.teamUser));
        Assert.That(thread02.Status, Is.EqualTo(NoteStatus.Todo.InternalValue));
        Assert.That(thread02.Assignment, Is.EqualTo(CommentThread.teamUser));
        SFProject project = env.GetProject();
        Assert.That(project.Sync.LastSyncSuccessful, Is.True);

        // Verify the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Status, Is.EqualTo(SyncStatus.Successful));
        Assert.That(
            syncMetrics.Notes,
            Is.EqualTo(new NoteSyncMetricInfo(added: 1, deleted: 0, updated: 0, removed: 0))
        );
        Assert.That(syncMetrics.NoteThreads, Is.EqualTo(new SyncMetricInfo(added: 1, deleted: 0, updated: 0)));

        // Add a conflict note
        env.SetupNewConflictNoteThreadChange("conflictthread01");
        env.GuidService.NewObjectId().Returns("conflict01");
        await env.Runner.RunAsync("project01", "user01", "project01_alt1", false, CancellationToken.None);

        Assert.That(env.ContainsNoteThread("project01", "conflict01"), Is.True);
        project = env.GetProject();
        Assert.That(project.Sync.LastSyncSuccessful, Is.True);

        // Verify the sync metrics
        syncMetrics = env.GetSyncMetrics("project01_alt1");
        Assert.That(syncMetrics.Status, Is.EqualTo(SyncStatus.Successful));
        Assert.That(
            syncMetrics.Notes,
            Is.EqualTo(new NoteSyncMetricInfo(added: 1, deleted: 0, updated: 0, removed: 0))
        );
        Assert.That(syncMetrics.NoteThreads, Is.EqualTo(new SyncMetricInfo(added: 1, deleted: 0, updated: 0)));
    }

    [Test]
    public async Task SyncAsync_RemovesNoteFromThreadDoc()
    {
        var env = new TestEnvironment();
        string sfProjectId = "project01";
        string threadId = "thread01";
        string dataId = "dataId01";
        var book = new Book("MAT", 1, true);
        env.SetupSFData(true, false, false, true, book);
        List<Note> beginningNoteSet = env.GetNoteThread(sfProjectId, dataId).Notes;
        beginningNoteSet.Add(
            new Note
            {
                DataId = "n03",
                ThreadId = threadId,
                SyncUserRef = "syncuser02",
                Content = "Paratext note 3.",
                DateCreated = new DateTime(2019, 1, 1, 8, 0, 0, DateTimeKind.Utc)
            }
        );
        await env.SetThreadNotesAsync(sfProjectId, dataId, beginningNoteSet);
        env.SetupPTData(book);
        env.SetupNoteRemovedChange(dataId, threadId, new[] { "n02" });
        NoteThread thread01 = env.GetNoteThread(sfProjectId, dataId);
        Assert.That(
            thread01.Notes.Select(n => n.DataId),
            Is.EquivalentTo(new[] { "n01", "n02", "n03" }),
            "setup: expecting several notes in doc"
        );

        // SUT 1
        await env.Runner.RunAsync(sfProjectId, "user01", sfProjectId, false, CancellationToken.None);

        thread01 = env.GetNoteThread(sfProjectId, dataId);
        Assert.That(thread01.Notes.Select(n => n.DataId), Is.EquivalentTo(new[] { "n01", "n03" }));
        SFProject project = env.GetProject();
        Assert.That(project.Sync.LastSyncSuccessful, Is.True);

        // Verify the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Status, Is.EqualTo(SyncStatus.Successful));
        Assert.That(
            syncMetrics.Notes,
            Is.EqualTo(new NoteSyncMetricInfo(added: 0, deleted: 0, updated: 0, removed: 1))
        );
        Assert.That(syncMetrics.NoteThreads, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 0)));

        // Remove note 3
        env.SetupNoteRemovedChange(dataId, threadId, new[] { "n03" });

        // SUT 2
        await env.Runner.RunAsync(sfProjectId, "user01", "project01_alt1", false, CancellationToken.None);

        Assert.That(env.ContainsNoteThread(sfProjectId, dataId), Is.True);
        project = env.GetProject();
        Assert.That(project.Sync.LastSyncSuccessful, Is.True);

        // Verify the sync metrics
        syncMetrics = env.GetSyncMetrics("project01_alt1");
        Assert.That(syncMetrics.Status, Is.EqualTo(SyncStatus.Successful));
        Assert.That(
            syncMetrics.Notes,
            Is.EqualTo(new NoteSyncMetricInfo(added: 0, deleted: 0, updated: 0, removed: 1))
        );
        Assert.That(syncMetrics.NoteThreads, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 0)));
    }

    [Test]
    public async Task SyncAsync_RemovesMultipleNotesFromThreadDoc()
    {
        var env = new TestEnvironment();
        string sfProjectId = "project01";
        string threadId = "thread01";
        string dataId = "dataId01";
        var book = new Book("MAT", 1, true);
        env.SetupSFData(true, false, false, true, book);
        List<Note> beginningNoteSet = env.GetNoteThread(sfProjectId, dataId).Notes;
        beginningNoteSet.Add(
            new Note
            {
                DataId = "n03",
                ThreadId = threadId,
                SyncUserRef = "syncuser02",
                Content = "Paratext note 3.",
                DateCreated = new DateTime(2019, 1, 1, 8, 0, 0, DateTimeKind.Utc)
            }
        );
        await env.SetThreadNotesAsync(sfProjectId, dataId, beginningNoteSet);
        env.SetupPTData(book);
        NoteThread thread01 = env.GetNoteThread(sfProjectId, dataId);
        Assert.That(
            thread01.Notes.Select(n => n.DataId),
            Is.EquivalentTo(new[] { "n01", "n02", "n03" }),
            "setup: expecting several notes in doc"
        );

        // Remove note 2 and 3
        env.SetupNoteRemovedChange(dataId, threadId, new[] { "n02", "n03" });
        // SUT
        await env.Runner.RunAsync(sfProjectId, "user01", sfProjectId, false, CancellationToken.None);
        Assert.That(env.ContainsNoteThread(sfProjectId, dataId), Is.True);
        thread01 = env.GetNoteThread(sfProjectId, dataId);
        Assert.That(thread01.Notes.Select(n => n.DataId), Is.EquivalentTo(new[] { "n01" }));
        var syncMetrics = env.GetSyncMetrics(sfProjectId);
        Assert.That(syncMetrics.Status, Is.EqualTo(SyncStatus.Successful));
        Assert.That(
            syncMetrics.Notes,
            Is.EqualTo(new NoteSyncMetricInfo(added: 0, deleted: 0, updated: 0, removed: 2))
        );
    }

    [Test]
    public async Task SyncAsync_NoteThreadDeleted()
    {
        var env = new TestEnvironment();
        var book = new Book("MAT", 1);
        env.SetupSFData(true, false, false, true, book);
        env.SetupPTData(book);
        env.SetupNoteRemovedChange("dataId01", "thread01", new[] { "n01", "n02" });

        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        // Verify the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Status, Is.EqualTo(SyncStatus.Successful));
        Assert.That(syncMetrics.NoteThreads, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 1, updated: 0)));

        // Verify that the note thread does not exist
        Assert.Throws<KeyNotFoundException>(() => env.GetNoteThread("project01", "thread01"));
    }

    [Test]
    public async Task SyncAsync_NoteThreadsGetResolved()
    {
        var env = new TestEnvironment();
        var book = new Book("MAT", 3, true);
        env.SetupSFData(true, false, false, true, book);
        env.SetupPTData(book);
        string threadId = "thread02";
        string dataId = "dataId02";
        env.SetupNewNoteThreadChange(threadId, "syncuser01");
        env.GuidService.NewObjectId().Returns(dataId);
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        // Verify the sync metrics
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Status, Is.EqualTo(SyncStatus.Successful));
        Assert.That(
            syncMetrics.Notes,
            Is.EqualTo(new NoteSyncMetricInfo(added: 1, deleted: 0, updated: 0, removed: 0))
        );
        Assert.That(syncMetrics.NoteThreads, Is.EqualTo(new SyncMetricInfo(added: 1, deleted: 0, updated: 0)));

        // Default resolved status is false
        NoteThread thread02 = env.GetNoteThread("project01", dataId);
        Assert.That(thread02.VerseRef.ToString(), Is.EqualTo("MAT 1:1"));
        Assert.That(thread02.Status, Is.EqualTo(NoteStatus.Todo.InternalValue));

        // Change resolve status to true
        env.SetupNoteStatusChange(dataId, threadId, NoteStatus.Resolved.InternalValue);
        await env.Runner.RunAsync("project01", "user01", "project01_alt1", false, CancellationToken.None);

        thread02 = env.GetNoteThread("project01", dataId);
        Assert.That(thread02.VerseRef.ToString(), Is.EqualTo("MAT 1:1"));
        Assert.That(thread02.Status, Is.EqualTo(NoteStatus.Resolved.InternalValue));

        // Verify the sync metrics
        syncMetrics = env.GetSyncMetrics("project01_alt1");
        Assert.That(syncMetrics.Status, Is.EqualTo(SyncStatus.Successful));
        Assert.That(
            syncMetrics.Notes,
            Is.EqualTo(new NoteSyncMetricInfo(added: 0, deleted: 0, updated: 0, removed: 0))
        );
        Assert.That(syncMetrics.NoteThreads, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 1)));

        // Change status back to false - happens if the note becomes unresolved again in Paratext
        env.SetupNoteStatusChange(dataId, threadId, NoteStatus.Todo.InternalValue);
        await env.Runner.RunAsync("project01", "user01", "project01_alt2", false, CancellationToken.None);

        thread02 = env.GetNoteThread("project01", dataId);
        Assert.That(thread02.VerseRef.ToString(), Is.EqualTo("MAT 1:1"));
        Assert.That(thread02.Status, Is.EqualTo(NoteStatus.Todo.InternalValue));

        // Verify the sync metrics
        syncMetrics = env.GetSyncMetrics("project01_alt2");
        Assert.That(syncMetrics.Status, Is.EqualTo(SyncStatus.Successful));
        Assert.That(
            syncMetrics.Notes,
            Is.EqualTo(new NoteSyncMetricInfo(added: 0, deleted: 0, updated: 0, removed: 0))
        );
        Assert.That(syncMetrics.NoteThreads, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 1)));
    }

    [Test]
    public async Task SyncAsync_NoteChange_None()
    {
        var env = new TestEnvironment();
        // Set up some PT and SF project data, including a Note.
        string projectId = "project01";
        var book = new Book("MAT", 3, true);
        env.SetupSFData(true, false, false, true, book);
        env.SetupPTData(book);
        string threadId = "thread01";
        string dataId = "dataId01";
        NoteThread thread03 = env.GetNoteThread(projectId, dataId);
        Note note = thread03.Notes[0];
        string origNoteData = note.NoteToString();

        // Not setting up any actual changes. This test partly shows that the helper method does not create changes
        // when the input is null.
        env.SetupThreadAndNoteChange(dataId, threadId, null, null);

        // SUT
        await env.Runner.RunAsync(projectId, "user01", projectId, false, CancellationToken.None);

        thread03 = env.GetNoteThread(projectId, dataId);
        note = thread03.Notes[0];
        // No incoming note changes mean no changes to the SF DB Notes.
        // This is not a particularly thorough check, but is showing at least that a few pieces have not changed.
        Assert.That(note.NoteToString(), Is.EqualTo(origNoteData), "Note data should not have been changed");

        // Verify the sync metrics - the note data will be updated, even though it is not changed
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Status, Is.EqualTo(SyncStatus.Successful));
        Assert.That(
            syncMetrics.Notes,
            Is.EqualTo(new NoteSyncMetricInfo(added: 0, deleted: 0, updated: 0, removed: 0))
        );
        Assert.That(syncMetrics.NoteThreads, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 0)));
    }

    [Test]
    public async Task SyncAsync_NoteChanges_SavedToSFDB()
    {
        // Note that there are multiple constructions of TestEnvironment, since
        // ParatextService.GetLastSharedRevision() returns different values before and after SendReceive.

        // Various changes to note properties, coming from PT, are recorded into the SF DB. For this to happen,
        // the changes will need to be both detected, as well as saved.
        // A PT Comment Content property was updated, which is detected and saved to SF DB.
        await (new TestEnvironment()).SimpleNoteChangeAppliedCheckerAsync<string>(
            (Note note) => note.Content,
            (Note note, string newValue) => note.Content = newValue,
            "new contents"
        );
        // A PT Comment Type property was updated, which is detected and saved to SF DB.
        await (new TestEnvironment()).SimpleNoteChangeAppliedCheckerAsync<string>(
            (Note note) => note.Type,
            (Note note, string newValue) => note.Type = newValue,
            NoteType.Conflict.InternalValue
        );
        // ConflictType property
        await (new TestEnvironment()).SimpleNoteChangeAppliedCheckerAsync<string>(
            (Note note) => note.ConflictType,
            (Note note, string newValue) => note.ConflictType = newValue,
            NoteConflictType.VerseTextConflict.InternalValue
        );
        // AcceptedChangeXml property
        await (new TestEnvironment()).SimpleNoteChangeAppliedCheckerAsync<string>(
            (Note note) => note.AcceptedChangeXml,
            (Note note, string newValue) => note.AcceptedChangeXml = newValue,
            "some xml"
        );
    }

    [Test]
    public async Task SyncAsync_ResourceChanged()
    {
        // Setup the environment so there will be Paratext changes
        var env = new TestEnvironment();
        env.SetupSFData(true, true, false, false, new Book("MAT", 2), new Book("MRK", 2));
        env.SetupPTData(new Book("MAT", 3), new Book("MRK", 1));

        // Setup the environment so the Paratext service will return that the resource has changed
        env.ParatextService.IsResource(Arg.Any<string>()).Returns(true);
        env.ParatextService.ResourceDocsNeedUpdating(Arg.Any<SFProject>(), Arg.Any<ParatextResource>()).Returns(true);
        env.ParatextService.SendReceiveAsync(
                Arg.Any<UserSecret>(),
                Arg.Any<string>(),
                Arg.Any<IProgress<ProgressState>>(),
                Arg.Any<CancellationToken>(),
                Arg.Any<SyncMetrics>()
            )
            .Returns(new ParatextResource());

        // SUT
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        env.MockLogger.AssertEventCount(
            (LogEvent logEvent) =>
                logEvent.LogLevel == LogLevel.Information && Regex.IsMatch(logEvent.Message, "Starting"),
            1
        );

        // The book text is retrieved from Paratext as the resource has changed
        env.ParatextService.Received().GetBookText(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<int>());

        Assert.IsNotNull(env.GetProject().ResourceConfig);
        Assert.That(env.ContainsText("project01", "MAT", 3), Is.True);
        Assert.That(env.ContainsText("project01", "MRK", 2), Is.False);

        // Check that the resource users metrics have been updated
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.ResourceUsers, Is.EqualTo(new SyncMetricInfo(2, 0, 0)));
    }

    [Test]
    public async Task SyncAsync_ResourceNotChanged()
    {
        // Setup the environment so there will be no Paratext changes
        var env = new TestEnvironment();
        env.SetupSFData(true, true, false, false, new Book("MAT", 2), new Book("MRK", 2));
        env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2));

        // Setup the environment so the Paratext service will return that the resource has not changed
        env.ParatextService.IsResource(Arg.Any<string>()).Returns(true);
        env.ParatextService.ResourceDocsNeedUpdating(Arg.Any<SFProject>(), Arg.Any<ParatextResource>()).Returns(false);
        env.ParatextService.SendReceiveAsync(
                Arg.Any<UserSecret>(),
                Arg.Any<string>(),
                Arg.Any<IProgress<ProgressState>>(),
                Arg.Any<CancellationToken>(),
                Arg.Any<SyncMetrics>()
            )
            .Returns(new ParatextResource());

        // SUT
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        env.MockLogger.AssertEventCount(
            (LogEvent logEvent) =>
                logEvent.LogLevel == LogLevel.Information && Regex.IsMatch(logEvent.Message, "Starting"),
            1
        );

        // The book text is not retrieved from Paratext as the resource did not change
        env.ParatextService.DidNotReceive().GetBookText(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<int>());

        Assert.IsNull(env.GetProject().ResourceConfig);
        Assert.That(env.ContainsText("project01", "MAT", 2), Is.True);
        Assert.That(env.ContainsText("project01", "MRK", 2), Is.True);
    }

    [Test]
    public async Task SyncAsync_SyncMetricsSetsDateStartedAndDateFinished()
    {
        var env = new TestEnvironment();
        env.SetupSFData(true, true, true, false);

        await env.Runner.RunAsync("project01", "user03", "project01", false, CancellationToken.None);

        SFProject project = env.VerifyProjectSync(false);
        Assert.That(project.Sync.DataInSync, Is.True);

        // Check that the date started and date finished are set
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.DateStarted, Is.Not.Null);
        Assert.That(syncMetrics.DateFinished, Is.Not.Null);
    }

    [Test]
    public async Task SyncAsync_SyncMetricsRecordsLogs()
    {
        var env = new TestEnvironment();
        env.SetupSFData(true, true, true, false);

        await env.Runner.RunAsync("project01", "user03", "project01", false, CancellationToken.None);

        SFProject project = env.VerifyProjectSync(false);
        Assert.That(project.Sync.DataInSync, Is.True);

        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.Log.Count, Is.Not.Zero);
    }

    [Test]
    public async Task SyncAsync_SyncMetricsRecordsBackupCreated()
    {
        var env = new TestEnvironment();
        env.SetupSFData(true, true, true, false, new Book("MAT", 2), new Book("MRK", 2));
        env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2));

        // Simulate that there is no backup, and that the backups are created successfully
        env.ParatextService.BackupExists(Arg.Any<UserSecret>(), Arg.Any<string>()).Returns(false);
        env.ParatextService.BackupRepository(Arg.Any<UserSecret>(), Arg.Any<string>()).Returns(true);

        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        // A backup was created before and after the sync
        env.ParatextService.Received(2).BackupRepository(Arg.Any<UserSecret>(), Arg.Any<string>());
        SFProject project = env.VerifyProjectSync(true);
        Assert.That(project.Sync.DataInSync, Is.True);

        // Check that the metrics were updated
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.RepositoryBackupCreated, Is.True);
    }

    [Test]
    public async Task SyncAsync_SyncMetricsRecordsParatextNotes()
    {
        var env = new TestEnvironment();
        Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
        env.SetupSFData(true, true, true, false, books);
        env.SetupPTData(books);
        var syncMetricInfo = new SyncMetricInfo(1, 2, 3);
        env.ParatextService.PutNotes(Arg.Any<UserSecret>(), "target", Arg.Any<XElement>()).Returns(syncMetricInfo);

        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        env.ParatextService.Received(2).PutNotes(Arg.Any<UserSecret>(), "target", Arg.Any<XElement>());

        env.VerifyProjectSync(true);

        // Check that as PutNotes was run twice, the metrics will be multiplied by two
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.ParatextNotes, Is.EqualTo(syncMetricInfo + syncMetricInfo));
    }

    [Test]
    public async Task SyncAsync_SyncMetricsRecordsParatextBooks()
    {
        var env = new TestEnvironment();
        Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
        env.SetupSFData(true, true, true, false, books);
        env.SetupPTData(books);
        env.ParatextService.PutBookText(
                Arg.Any<UserSecret>(),
                Arg.Any<string>(),
                Arg.Any<int>(),
                Arg.Any<XDocument>(),
                Arg.Any<Dictionary<int, string>>()
            )
            .Returns(1);

        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        await env
            .ParatextService.Received(2)
            .PutBookText(
                Arg.Any<UserSecret>(),
                Arg.Any<string>(),
                Arg.Any<int>(),
                Arg.Any<XDocument>(),
                Arg.Any<Dictionary<int, string>>()
            );
        ;

        SFProject project = env.GetProject();
        Assert.That(project.ParatextUsers.Count, Is.EqualTo(2));
        env.VerifyProjectSync(true);

        // Check that as PutBookText was run twice, the metrics will be that two books are added
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.ParatextBooks, Is.EqualTo(new SyncMetricInfo(0, 0, 2)));
    }

    [Test]
    public async Task SyncAsync_OnlyTargetParatextUsersAreGivenResourceAccess()
    {
        // Setup the environment so there will be Paratext changes
        var env = new TestEnvironment();
        env.SetupSFData(true, true, false, false, new Book("MAT", 2), new Book("MRK", 2));
        env.SetupPTData(new Book("MAT", 3), new Book("MRK", 1));

        // Make user02 an SF only user
        await env.SetUserRole("user02", SFProjectRole.CommunityChecker);

        // Setup the environment so the Paratext service will return that source is a resource
        env.ParatextService.IsResource(Arg.Any<string>()).Returns(true);
        env.ParatextService.SendReceiveAsync(
                Arg.Any<UserSecret>(),
                Arg.Any<string>(),
                Arg.Any<IProgress<ProgressState>>(),
                Arg.Any<CancellationToken>(),
                Arg.Any<SyncMetrics>()
            )
            .Returns(new ParatextResource());

        // Ensure that the source is project02, and has no users with access
        Assert.AreEqual("project02", env.GetProject().TranslateConfig.Source.ProjectRef);
        Assert.AreEqual(0, env.GetProject("project02").UserRoles.Count);

        // SUT
        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        env.MockLogger.AssertEventCount(
            (LogEvent logEvent) =>
                logEvent.LogLevel == LogLevel.Information && Regex.IsMatch(logEvent.Message, "Starting"),
            1
        );

        // Only one user should have been added, although three are present
        Assert.AreEqual(3, env.GetProject().UserRoles.Count);
        await env.SFProjectService.Received(1).AddUserAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>());

        // Check that the resource users metrics have been updated
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.ResourceUsers, Is.EqualTo(new SyncMetricInfo(1, 0, 0)));
    }

    [Test]
    public async Task SyncAsync_BiblicalTermsAreUpdated()
    {
        var env = new TestEnvironment();
        Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
        env.SetupSFData(true, true, true, false, books);
        env.SetupPTData(books);

        // This Biblical Term will be updated
        env.RealtimeService.GetRepository<BiblicalTerm>()
            .Add(
                new BiblicalTerm
                {
                    Id = "project01:dataId01",
                    OwnerRef = "ownerRef01",
                    ProjectRef = "project01",
                    DataId = "dataId01",
                    TermId = "termId01",
                    Transliteration = "transliteration01",
                    Renderings = new[] { "rendering01", "rendering02" },
                    Description = "description01",
                    Language = "language01",
                    Links = new[] { "link01", "link02" },
                    References = new[] { VerseRef.GetBBBCCCVVV(1, 1, 1), VerseRef.GetBBBCCCVVV(2, 2, 2) },
                    Definitions = new Dictionary<string, BiblicalTermDefinition>
                    {
                        ["en"] = new BiblicalTermDefinition
                        {
                            Categories = new[] { "category01_en", "category02_en" },
                            Domains = new[] { "domain01_en", "domain02_en" },
                            Gloss = "gloss01_en",
                            Notes = "notes01_en",
                        },
                        ["fr"] = new BiblicalTermDefinition
                        {
                            Categories = new[] { "category01_fr", "category02_fr" },
                            Domains = new[] { "domain01_fr", "domain02_fr" },
                            Gloss = "gloss01_fr",
                            Notes = "notes01_fr",
                        },
                    },
                }
            );

        // This Biblical Term will be deleted
        env.RealtimeService.GetRepository<BiblicalTerm>()
            .Add(
                new BiblicalTerm
                {
                    Id = "project01:dataId02",
                    DataId = "dataId02",
                    ProjectRef = "project01",
                    TermId = "termId02",
                }
            );

        env.ParatextService.GetBiblicalTermsAsync(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<IEnumerable<int>>())
            .Returns(
                Task.FromResult(
                    new BiblicalTermsChanges
                    {
                        BiblicalTerms =
                        {
                            // This Biblical Term will be updated
                            new BiblicalTerm
                            {
                                TermId = "termId01",
                                Transliteration = "transliteration02",
                                Renderings = new[] { "rendering02", "rendering03" },
                                Description = "description02",
                                Language = "language02",
                                Links = new[] { "link02", "link03" },
                                References = new[] { VerseRef.GetBBBCCCVVV(2, 2, 2), VerseRef.GetBBBCCCVVV(3, 3, 3) },
                                Definitions = new Dictionary<string, BiblicalTermDefinition>
                                {
                                    ["en"] = new BiblicalTermDefinition
                                    {
                                        Categories = new[] { "category02_en", "category03_en" },
                                        Domains = new[] { "domain02_en", "domain03_en" },
                                        Gloss = "gloss02_en",
                                        Notes = "notes02_en",
                                    },
                                    ["de"] = new BiblicalTermDefinition
                                    {
                                        Categories = new[] { "category01_de", "category02_de" },
                                        Domains = new[] { "domain01_de", "domain02_de" },
                                        Gloss = "gloss01_de",
                                        Notes = "notes01_de",
                                    },
                                },
                            },
                            // This Biblical Term will be added
                            new BiblicalTerm { TermId = "termId03" },
                        },
                        ErrorMessage = string.Empty,
                        HasRenderings = true,
                    }
                )
            );
        env.GuidService.NewObjectId().Returns("dataId03");

        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);

        env.ParatextService.Received(1)
            .UpdateBiblicalTerms(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<IReadOnlyList<BiblicalTerm>>());

        SFProject project = env.GetProject();
        Assert.That(project.ParatextUsers.Count, Is.EqualTo(2));
        env.VerifyProjectSync(true);

        // dataId02 should be deleted
        Assert.IsFalse(env.RealtimeService.GetRepository<BiblicalTerm>().Contains("project01:dataId02"));

        // dataId03 should have been created
        Assert.IsNotNull(env.RealtimeService.GetRepository<BiblicalTerm>().Get("project01:dataId03"));

        // Ensure dataId01 has been updated correctly
        var biblicalTerm = env.RealtimeService.GetRepository<BiblicalTerm>().Get("project01:dataId01");

        // DataId, ProjectRef, and TermId should not change
        Assert.AreEqual("dataId01", biblicalTerm.DataId);
        Assert.AreEqual("project01", biblicalTerm.ProjectRef);
        Assert.AreEqual("termId01", biblicalTerm.TermId);

        // The description and renderings in Paratext were overwritten by the values from the repo, so have not changed
        Assert.AreEqual("description01", biblicalTerm.Description);
        Assert.AreEqual(2, biblicalTerm.Renderings.Count);
        Assert.AreEqual("rendering01", biblicalTerm.Renderings.First());
        Assert.AreEqual("rendering02", biblicalTerm.Renderings.Last());

        // The transliteration, language, links, references, and definitions will be updated
        Assert.AreEqual("transliteration02", biblicalTerm.Transliteration);
        Assert.AreEqual("language02", biblicalTerm.Language);
        Assert.AreEqual(2, biblicalTerm.Links.Count);
        Assert.AreEqual("link02", biblicalTerm.Links.First());
        Assert.AreEqual("link03", biblicalTerm.Links.Last());
        Assert.AreEqual(2, biblicalTerm.References.Count);
        Assert.AreEqual(VerseRef.GetBBBCCCVVV(2, 2, 2), biblicalTerm.References.First());
        Assert.AreEqual(VerseRef.GetBBBCCCVVV(3, 3, 3), biblicalTerm.References.Last());

        // French should have been deleted
        Assert.IsFalse(biblicalTerm.Definitions.ContainsKey("fr"));

        // German should have been added
        Assert.AreEqual("category01_de", biblicalTerm.Definitions["de"].Categories.First());
        Assert.AreEqual("category02_de", biblicalTerm.Definitions["de"].Categories.Last());
        Assert.AreEqual("domain01_de", biblicalTerm.Definitions["de"].Domains.First());
        Assert.AreEqual("domain02_de", biblicalTerm.Definitions["de"].Domains.Last());
        Assert.AreEqual("gloss01_de", biblicalTerm.Definitions["de"].Gloss);
        Assert.AreEqual("notes01_de", biblicalTerm.Definitions["de"].Notes);

        // English should be been updated
        Assert.AreEqual("category02_en", biblicalTerm.Definitions["en"].Categories.First());
        Assert.AreEqual("category03_en", biblicalTerm.Definitions["en"].Categories.Last());
        Assert.AreEqual("domain02_en", biblicalTerm.Definitions["en"].Domains.First());
        Assert.AreEqual("domain03_en", biblicalTerm.Definitions["en"].Domains.Last());
        Assert.AreEqual("gloss02_en", biblicalTerm.Definitions["en"].Gloss);
        Assert.AreEqual("notes02_en", biblicalTerm.Definitions["en"].Notes);
    }

    [Test]
    public async Task SyncAsync_AddParatextBiblicalTermNotes()
    {
        var env = new TestEnvironment();
        var book = new Book("MAT", 1, true);
        env.SetupSFData(true, false, false, true, book);
        env.SetupPTData(book);
        Book[] books = { book };
        env.AddParatextNoteThreadData(books, true, true, true);
        SyncMetricInfo info = new SyncMetricInfo(1, 0, 0);
        env.ParatextService.UpdateParatextCommentsAsync(
                Arg.Any<UserSecret>(),
                "target",
                Arg.Any<IEnumerable<IDocument<NoteThread>>>(),
                Arg.Any<Dictionary<string, string>>(),
                Arg.Any<Dictionary<string, ParatextUserProfile>>(),
                Arg.Any<int>()
            )
            .Returns(Task.FromResult(info));

        await env.Runner.RunAsync("project01", "user01", "project01", false, CancellationToken.None);
        await env
            .ParatextService.Received(1)
            .UpdateParatextCommentsAsync(
                Arg.Any<UserSecret>(),
                "target",
                Arg.Is<IEnumerable<IDocument<NoteThread>>>(t => t.Single().Id == "project01:dataId01"),
                Arg.Any<Dictionary<string, string>>(),
                Arg.Any<Dictionary<string, ParatextUserProfile>>(),
                Arg.Any<int>()
            );

        env.ParatextService.Received(1)
            .GetNoteThreadChanges(
                Arg.Any<UserSecret>(),
                "target",
                null,
                Arg.Is<IEnumerable<IDocument<NoteThread>>>(t => t.Single().Data.Notes.All(n => n.OwnerRef == "user03")),
                Arg.Any<Dictionary<int, ChapterDelta>>(),
                Arg.Any<Dictionary<string, ParatextUserProfile>>()
            );
        SFProject project = env.GetProject();
        NoteThread noteThread = env.GetNoteThread("project01", "dataId01");
        Assert.That(noteThread.Notes[0].OwnerRef, Is.EqualTo("user03"));
        Assert.That(noteThread.BiblicalTermId, Is.EqualTo("biblicalTerm01"));
        Assert.That(noteThread.ExtraHeadingInfo?.Gloss, Is.EqualTo("gloss01"));
        Assert.That(noteThread.ExtraHeadingInfo?.Language, Is.EqualTo("language01"));
        Assert.That(noteThread.ExtraHeadingInfo?.Lemma, Is.EqualTo("lemma01"));
        Assert.That(noteThread.ExtraHeadingInfo?.Transliteration, Is.EqualTo("transliteration01"));
        Assert.That(project.ParatextUsers.Select(u => u.Username), Is.EquivalentTo(new[] { "User 1", "User 2" }));
        SyncMetrics syncMetrics = env.GetSyncMetrics("project01");
        Assert.That(syncMetrics.ParatextNotes, Is.EqualTo(info));
    }

    [Test]
    public async Task UpdateParatextBook_Unchanged()
    {
        TestEnvironment env = new();
        env.Runner._syncMetrics = Substitute.For<SyncMetrics>();
        StringBuilder sb = new();
        sb.AppendLine("<usx version=\"3.0\">");
        sb.AppendLine("  <book code=\"RUT\" style=\"id\">- American Standard Version</book>");
        sb.AppendLine("  <para style=\"h\">Ruth</para>");
        sb.AppendLine("  <chapter number=\"1\" style=\"c\" />");
        sb.AppendLine("  <para style=\"p\">");
        sb.AppendLine("    <verse number=\"1\" style=\"v\" />");
        sb.AppendLine(
            "And it came to pass in the days <verse number=\"2\" style=\"v\" />And the name of the man</para>"
        );
        sb.AppendLine("  <chapter number=\"2\" style=\"c\" />");
        sb.AppendLine("  <para style=\"p\">");
        sb.AppendLine("    <verse number=\"1\" style=\"v\" />");
        sb.AppendLine("And Naomi had a kinsman of her husband <verse number=\"2\" style=\"v\" />And Ruth the</para>");
        sb.AppendLine("</usx>");
        string bookUsx = sb.ToString();
        env.ParatextService.GetBookText(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<int>()).Returns(bookUsx);
        // ToUsx returns the XDocument unchanged.
        env.DeltaUsxMapper.ToUsx(Arg.Any<XDocument>(), Arg.Any<IEnumerable<ChapterDelta>>())
            .Returns((CallInfo callInfo) => callInfo.Arg<XDocument>());
        // SUT
        await env.Runner.UpdateParatextBookAsync(
            Substitute.For<TextInfo>(),
            "some-paratext-id",
            Substitute.For<SortedList<int, IDocument<TextData>>>()
        );
        // The usx was unchanged by content of chapter deltas, so we don't write something new.
        await env
            .ParatextService.DidNotReceive()
            .PutBookText(
                Arg.Any<UserSecret>(),
                Arg.Any<string>(),
                Arg.Any<int>(),
                Arg.Any<XDocument>(),
                Arg.Any<Dictionary<int, string>>()
            );
    }

    [Test]
    public async Task UpdateParatextBook_Changed()
    {
        TestEnvironment env = new();
        env.Runner._syncMetrics = Substitute.For<SyncMetrics>();
        // (Use StringBuilder rather than a multi-line literal so that we use environment-specific newlines.)
        StringBuilder sb = new();
        sb.AppendLine("<usx version=\"3.0\">");
        sb.AppendLine("<book code=\"RUT\" style=\"id\" />");
        sb.AppendLine("<chapter number=\"1\" style=\"c\" />");
        sb.AppendLine("<para style=\"p\">");
        sb.AppendLine("<verse number=\"1\" style=\"v\" />");
        sb.AppendLine("And it came to pass in the days");
        sb.AppendLine("</para>");
        sb.AppendLine("</usx>");
        string bookUsx = sb.ToString();
        env.ParatextService.GetBookText(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<int>()).Returns(bookUsx);
        // Different content
        StringBuilder sbRevisedUsx = new();
        sbRevisedUsx.AppendLine("<usx version=\"3.0\">");
        sbRevisedUsx.AppendLine(
            "<book code=\"RUT\" style=\"id\" /><chapter number=\"1\" style=\"c\" /><para style=\"p\"><verse number=\"1\" style=\"v\" />And it came to pass DIFFERENT</para></usx>"
        );
        string revisedUsx = sbRevisedUsx.ToString();
        // Unfortunately, the means to craft the ToUsx return value is closely related to what we are
        // testing in the SUT. And so whether the revision is "different" relates to how we compose it here.
        XDocument revisedXDoc = XDocument.Parse(revisedUsx, LoadOptions.PreserveWhitespace);
        Assert.That(revisedXDoc.ToString(), Is.EqualTo(revisedUsx), "setup");
        env.DeltaUsxMapper.ToUsx(Arg.Any<XDocument>(), Arg.Any<IEnumerable<ChapterDelta>>()).Returns(revisedXDoc);
        // SUT
        await env.Runner.UpdateParatextBookAsync(
            Substitute.For<TextInfo>(),
            "some-paratext-project-id",
            Substitute.For<SortedList<int, IDocument<TextData>>>()
        );
        // The usx was changed by the content of chapter deltas, so we do write something new.
        await env
            .ParatextService.Received()
            .PutBookText(
                Arg.Any<UserSecret>(),
                Arg.Any<string>(),
                Arg.Any<int>(),
                revisedXDoc,
                Arg.Any<Dictionary<int, string>>()
            );
    }

    [Test]
    public async Task UpdateParatextBook_SpacesBetweenChars_Unchanged()
    {
        TestEnvironment env = new();
        env.Runner._syncMetrics = Substitute.For<SyncMetrics>();
        StringBuilder sb = new();
        sb.AppendLine("<usx version=\"3.0\">");
        sb.AppendLine("  <book code=\"RUT\" style=\"id\">- American Standard Version</book>");
        sb.AppendLine("  <chapter number=\"1\" style=\"c\" />");
        sb.AppendLine("  <para style=\"p\">");
        sb.AppendLine("    <verse number=\"1\" style=\"v\" />");
        sb.AppendLine("And it came to <char style=\"w\">pass</char> <char style=\"w\">in</char> the days</para>");
        sb.AppendLine("</usx>");
        string bookUsx = sb.ToString();
        env.ParatextService.GetBookText(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<int>()).Returns(bookUsx);
        // Unchanged
        env.DeltaUsxMapper.ToUsx(Arg.Any<XDocument>(), Arg.Any<IEnumerable<ChapterDelta>>())
            .Returns((CallInfo callInfo) => callInfo.Arg<XDocument>());
        // SUT
        await env.Runner.UpdateParatextBookAsync(
            Substitute.For<TextInfo>(),
            "some-paratext-id",
            Substitute.For<SortedList<int, IDocument<TextData>>>()
        );
        // The usx was unchanged by content of chapter deltas, so we don't write something new.
        // Importantly, the space between <char> elements should not have been removed (as in SF-1444).
        await env
            .ParatextService.DidNotReceive()
            .PutBookText(
                Arg.Any<UserSecret>(),
                Arg.Any<string>(),
                Arg.Any<int>(),
                Arg.Any<XDocument>(),
                Arg.Any<Dictionary<int, string>>()
            );
    }

    [Test]
    public void GetBookUsx_ExpectedFormatting()
    {
        TestEnvironment env = new();
        StringBuilder sb = new();
        sb.AppendLine("<usx version=\"3.0\">");
        sb.AppendLine("  <book code=\"RUT\" style=\"id\">- American Standard Version</book>");
        sb.AppendLine("  <chapter number=\"1\" style=\"c\" />");
        sb.AppendLine("  <para style=\"p\">");
        sb.AppendLine("    <verse number=\"1\" style=\"v\" />");
        sb.AppendLine("And it came to <char style=\"w\">pass</char> <char style=\"w\">in</char> the days </para>");
        sb.AppendLine("</usx>");
        string bookUsxFromParatextData = sb.ToString();
        env.ParatextService.GetBookText(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<int>())
            .Returns(bookUsxFromParatextData);
        // SUT
        XDocument result = env.Runner.GetBookUsx("some-pt-project-id", 1);
        string expectedUsx =
            @"<usx version=""3.0""><book code=""RUT"" style=""id"">- American Standard Version</book><chapter number=""1"" style=""c"" /><para style=""p""><verse number=""1"" style=""v"" />And it came to <char style=""w"">pass</char> <char style=""w"">in</char> the days </para></usx>";
        string actualUsx = TestEnvironment.XDocumentToStringUnformatted(result);
        Assert.That(actualUsx, Is.EqualTo(expectedUsx), "is formatted as desired");
    }

    [Test]
    public void GetBookUsx_ExpectedFormatting2()
    {
        TestEnvironment env = new();
        // This is a real sample from ASV, as converted to USX by ParatextData and modified a bit for the test.
        string bookUsxFromParatextData =
            "<usx version=\"3.0\">\r\n  <book code=\"1SA\" style=\"id\">- American Standard Version</book>\r\n  <para style=\"h\">1 Samuel</para>\r\n  <chapter number=\"1\" style=\"c\" />\r\n  <para style=\"p\">\r\n    <verse number=\"1\" style=\"v\" />\r\n    <char style=\"w\" strong=\"H1961\">Now</char> <char style=\"w\" strong=\"H1961\">there</char> <char style=\"w\" strong=\"H8034\">was</char> ... <char style=\"w\" strong=\"H1961\">an</char> <char style=\"w\" strong=\"H0673\">Ephraimite</char>:</para>\r\n</usx>";
        env.ParatextService.GetBookText(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<int>())
            .Returns(bookUsxFromParatextData);
        // SUT
        XDocument result = env.Runner.GetBookUsx("some-pt-project-id", 1);
        string expectedUsx =
            "<usx version=\"3.0\"><book code=\"1SA\" style=\"id\">- American Standard Version</book><para style=\"h\">1 Samuel</para><chapter number=\"1\" style=\"c\" /><para style=\"p\"><verse number=\"1\" style=\"v\" /><char style=\"w\" strong=\"H1961\">Now</char> <char style=\"w\" strong=\"H1961\">there</char> <char style=\"w\" strong=\"H8034\">was</char> ... <char style=\"w\" strong=\"H1961\">an</char> <char style=\"w\" strong=\"H0673\">Ephraimite</char>:</para></usx>";
        string actualUsx = TestEnvironment.XDocumentToStringUnformatted(result);
        Assert.That(actualUsx, Is.EqualTo(expectedUsx), "is formatted as desired");
    }

    [Test]
    public void GetBookUsx_ExpectedFormatting3()
    {
        TestEnvironment env = new();
        // This test is derived from the following USFM, which is from Matthew 5 (OEB). There are no spaces at the ends
        // of the lines in the original USFM.
        //
        // \m
        // \v 11 \wj “Blessed are you when people insult you, and persecute you, and say all kinds of evil lies about you because of me.\wj*
        // \v 12 \wj Be glad and rejoice, because your reward in heaven will be great; this is the way they persecuted the prophets who lived before you.\wj*
        // \p
        // \v 13 \wj “You are salt for the world. But if salt becomes tasteless, how can it be made salty again? It is no longer good for anything, but is thrown away, and trampled underfoot.\wj*
        // This is the USX as converted to USX by ParatextData UsfmToUsx.ConvertToXmlString. I altered it by removing
        // content both before and after the USX that was made from the USFM section. Notice that between verses
        // 11 and 12 there is a space, and between verses 12 and 13, there are spaces, but only spaces at the
        // beginning of a line. Some further reading about whitespace in USFM can be found
        // at https://ubsicap.github.io/usfm/about/syntax.html#newlines.
        string bookUsxFromParatextData =
            "<usx version=\"3.0\">\r\n  <book code=\"MAT\" style=\"id\" />\r\n  <para style=\"m\">\r\n    <verse number=\"11\" style=\"v\" />\r\n    <char style=\"wj\">“Blessed are you when people insult you, and persecute you, and say all kinds of evil lies about you because of me.</char> <verse number=\"12\" style=\"v\" /><char style=\"wj\">Be glad and rejoice, because your reward in heaven will be great; this is the way they persecuted the prophets who lived before you.</char></para>\r\n  <para style=\"p\">\r\n    <verse number=\"13\" style=\"v\" />\r\n    <char style=\"wj\">“You are salt for the world. But if salt becomes tasteless, how can it be made salty again? It is no longer good for anything, but is thrown away, and trampled underfoot.</char></para></usx>";
        env.ParatextService.GetBookText(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<int>())
            .Returns(bookUsxFromParatextData);
        // SUT
        XDocument result = env.Runner.GetBookUsx("some-pt-project-id", 1);
        // The space between verse 11 and 12 is retained. The spaces between verse 12 and 13 (which is also a
        // paragraph boundary), are not retained.
        string expectedUsx =
            "<usx version=\"3.0\"><book code=\"MAT\" style=\"id\" /><para style=\"m\"><verse number=\"11\" style=\"v\" /><char style=\"wj\">“Blessed are you when people insult you, and persecute you, and say all kinds of evil lies about you because of me.</char> <verse number=\"12\" style=\"v\" /><char style=\"wj\">Be glad and rejoice, because your reward in heaven will be great; this is the way they persecuted the prophets who lived before you.</char></para><para style=\"p\"><verse number=\"13\" style=\"v\" /><char style=\"wj\">“You are salt for the world. But if salt becomes tasteless, how can it be made salty again? It is no longer good for anything, but is thrown away, and trampled underfoot.</char></para></usx>";
        string actualUsx = TestEnvironment.XDocumentToStringUnformatted(result);
        Assert.That(actualUsx, Is.EqualTo(expectedUsx), "is formatted as desired");
    }

    [Test]
    public void GetBookUsx_ExpectedFormatting4()
    {
        TestEnvironment env = new();

        // This test is derived from the following USFM, which is from Ruth 1 (OEB). There are no spaces at the ends
        // of the lines in the original USFM.
        // Notice that this sample has a verse (7) which ends in the middle of a sentence, as well as a verse (9) which
        // crosses a paragraph boundary.
        /*
\p
\v 6 So she set out with her daughters-in-law to return from the land of Moab, for she had heard that the \nd Lord\nd* had remembered his people and given them food.
\v 7 As they were setting out together on the journey to Judah,
\v 8 Naomi said to her daughters-in-law, “Go, return both of you to the home of your mother. May the \nd Lord\nd* be kind to you as you have been kind to the dead and to me.
\v 9 The \nd Lord\nd* grant that each of you may find peace and happiness in the house of a new husband.”

\p Then she kissed them; but they began to weep aloud
\v 10 and said to her, “No, we will return with you to your people.”
        */

        // This is the USX as converted to USX by ParatextData UsfmToUsx.ConvertToXmlString. I altered it by removing
        // content both before and after the USX that was made from the USFM section.
        string bookUsxFromParatextData =
            "<usx version=\"3.0\">\r\n  <book code=\"RUT\" style=\"id\">Open English Bible</book>\r\n  <chapter number=\"1\" style=\"c\" />\r\n  <para style=\"p\">\r\n    <verse number=\"6\" style=\"v\" />So she set out with her daughters-in-law to return from the land of Moab, for she had heard that the <char style=\"nd\">Lord</char> had remembered his people and given them food. <verse number=\"7\" style=\"v\" />As they were setting out together on the journey to Judah, <verse number=\"8\" style=\"v\" />Naomi said to her daughters-in-law, “Go, return both of you to the home of your mother. May the <char style=\"nd\">Lord</char> be kind to you as you have been kind to the dead and to me. <verse number=\"9\" style=\"v\" />The <char style=\"nd\">Lord</char> grant that each of you may find peace and happiness in the house of a new husband.”</para>\r\n  <para style=\"p\">Then she kissed them; but they began to weep aloud <verse number=\"10\" style=\"v\" />and said to her, “No, we will return with you to your people.”</para>\r\n</usx>";
        env.ParatextService.GetBookText(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<int>())
            .Returns(bookUsxFromParatextData);

        // SUT
        XDocument result = env.Runner.GetBookUsx("some-pt-project-id", 1);

        // The space between v7 and v8 is retained. There is no space right before or after the begin- or end-paragraph
        // tags of verse 9.
        string expectedUsx =
            "<usx version=\"3.0\"><book code=\"RUT\" style=\"id\">Open English Bible</book><chapter number=\"1\" style=\"c\" /><para style=\"p\"><verse number=\"6\" style=\"v\" />So she set out with her daughters-in-law to return from the land of Moab, for she had heard that the <char style=\"nd\">Lord</char> had remembered his people and given them food. <verse number=\"7\" style=\"v\" />As they were setting out together on the journey to Judah, <verse number=\"8\" style=\"v\" />Naomi said to her daughters-in-law, “Go, return both of you to the home of your mother. May the <char style=\"nd\">Lord</char> be kind to you as you have been kind to the dead and to me. <verse number=\"9\" style=\"v\" />The <char style=\"nd\">Lord</char> grant that each of you may find peace and happiness in the house of a new husband.”</para><para style=\"p\">Then she kissed them; but they began to weep aloud <verse number=\"10\" style=\"v\" />and said to her, “No, we will return with you to your people.”</para></usx>";
        string actualUsx = TestEnvironment.XDocumentToStringUnformatted(result);
        Assert.That(actualUsx, Is.EqualTo(expectedUsx), "is formatted as desired");
    }

    [Test]
    public void GetBookUsx_SequentialNewlines_ExpectedFormatting()
    {
        TestEnvironment env = new();

        // Suppose the text has sequential newlines. (Notice that after the opening usx element tag, the CRLF sequence
        // occurs twice, with no content between them.)
        string bookUsxFromParatextData =
            "<usx version=\"3.0\">\r\n\r\n  <book code=\"1SA\" style=\"id\" />\r\n  <chapter number=\"1\" style=\"c\" />\r\n  <para style=\"p\">\r\n    <verse number=\"1\" style=\"v\" />\r\n    <char style=\"w\" strong=\"H1961\">Now</char> <char style=\"w\" strong=\"H1961\">there</char></para>\r\n</usx>";
        env.ParatextService.GetBookText(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<int>())
            .Returns(bookUsxFromParatextData);

        // SUT
        XDocument result = env.Runner.GetBookUsx("some-pt-project-id", 1);

        string expectedUsx =
            "<usx version=\"3.0\"><book code=\"1SA\" style=\"id\" /><chapter number=\"1\" style=\"c\" /><para style=\"p\"><verse number=\"1\" style=\"v\" /><char style=\"w\" strong=\"H1961\">Now</char> <char style=\"w\" strong=\"H1961\">there</char></para></usx>";
        string actualUsx = TestEnvironment.XDocumentToStringUnformatted(result);
        Assert.That(actualUsx, Is.EqualTo(expectedUsx), "is formatted as desired");
    }

    [Test]
    public void GetBookUsx_InitialSpace_ExpectedFormatting()
    {
        TestEnvironment env = new();

        // Suppose the usx element has whitespace before it.
        string bookUsxFromParatextData =
            "    <usx version=\"3.0\">\r\n  <book code=\"1SA\" style=\"id\" />\r\n  <chapter number=\"1\" style=\"c\" />\r\n  <para style=\"p\">\r\n    <verse number=\"1\" style=\"v\" />\r\n    <char style=\"w\" strong=\"H1961\">Now</char> <char style=\"w\" strong=\"H1961\">there</char></para>\r\n</usx>";
        env.ParatextService.GetBookText(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<int>())
            .Returns(bookUsxFromParatextData);

        // SUT
        XDocument result = env.Runner.GetBookUsx("some-pt-project-id", 1);

        string expectedUsx =
            "<usx version=\"3.0\"><book code=\"1SA\" style=\"id\" /><chapter number=\"1\" style=\"c\" /><para style=\"p\"><verse number=\"1\" style=\"v\" /><char style=\"w\" strong=\"H1961\">Now</char> <char style=\"w\" strong=\"H1961\">there</char></para></usx>";
        string actualUsx = TestEnvironment.XDocumentToStringUnformatted(result);
        Assert.That(actualUsx, Is.EqualTo(expectedUsx), "the initial whitespace is removed");
    }

    [Test]
    public void GetBookUsx_InitialNewline_ExpectedFormatting()
    {
        TestEnvironment env = new();

        // Suppose the usx element has a newline before it.
        string bookUsxFromParatextData =
            "\r\n<usx version=\"3.0\">\r\n  <book code=\"1SA\" style=\"id\" />\r\n  <chapter number=\"1\" style=\"c\" />\r\n  <para style=\"p\">\r\n    <verse number=\"1\" style=\"v\" />\r\n    <char style=\"w\" strong=\"H1961\">Now</char> <char style=\"w\" strong=\"H1961\">there</char></para>\r\n</usx>";
        env.ParatextService.GetBookText(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<int>())
            .Returns(bookUsxFromParatextData);

        // SUT
        XDocument result = env.Runner.GetBookUsx("some-pt-project-id", 1);

        string expectedUsx =
            "<usx version=\"3.0\"><book code=\"1SA\" style=\"id\" /><chapter number=\"1\" style=\"c\" /><para style=\"p\"><verse number=\"1\" style=\"v\" /><char style=\"w\" strong=\"H1961\">Now</char> <char style=\"w\" strong=\"H1961\">there</char></para></usx>";
        string actualUsx = TestEnvironment.XDocumentToStringUnformatted(result);
        Assert.That(actualUsx, Is.EqualTo(expectedUsx), "the initial whitespace is removed");
    }

    [Test]
    public void GetBookUsx_InitialWhitespace_ExpectedFormatting()
    {
        TestEnvironment env = new();

        // Suppose the usx element has a mix of whitespace before it
        string bookUsxFromParatextData =
            "    \r\n    \r\n    <usx version=\"3.0\">\r\n  <book code=\"1SA\" style=\"id\" />\r\n  <chapter number=\"1\" style=\"c\" />\r\n  <para style=\"p\">\r\n    <verse number=\"1\" style=\"v\" />\r\n    <char style=\"w\" strong=\"H1961\">Now</char> <char style=\"w\" strong=\"H1961\">there</char></para>\r\n</usx>";
        env.ParatextService.GetBookText(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<int>())
            .Returns(bookUsxFromParatextData);

        // SUT
        XDocument result = env.Runner.GetBookUsx("some-pt-project-id", 1);

        string expectedUsx =
            "<usx version=\"3.0\"><book code=\"1SA\" style=\"id\" /><chapter number=\"1\" style=\"c\" /><para style=\"p\"><verse number=\"1\" style=\"v\" /><char style=\"w\" strong=\"H1961\">Now</char> <char style=\"w\" strong=\"H1961\">there</char></para></usx>";
        string actualUsx = TestEnvironment.XDocumentToStringUnformatted(result);
        Assert.That(actualUsx, Is.EqualTo(expectedUsx), "the initial whitespace is removed");
    }

    /// <summary>
    /// This is an integration test, using a real DeltaUsxMapper, and testing the behaviour of ParatextSyncRunner.
    /// </summary>
    [Test]
    public void GetParatextChaptersAsDeltas_BeginsWithExpectedContent()
    {
        IGuidService mapperGuidService = new TestGuidService();
        ILogger<DeltaUsxMapper> logger = Substitute.For<ILogger<DeltaUsxMapper>>();
        IExceptionHandler exceptionHandler = Substitute.For<IExceptionHandler>();
        DeltaUsxMapper mapper = new(mapperGuidService, logger, exceptionHandler);
        TestEnvironment env = new(false, mapper);

        TextInfo textInfo = new() { BookNum = 8, Chapters = null };
        StringBuilder sb = new();
        sb.AppendLine("<usx version=\"3.0\">");
        sb.AppendLine("  <book code=\"RUT\" style=\"id\">- American Standard Version</book>");
        sb.AppendLine("  <chapter number=\"1\" style=\"c\" />");
        sb.AppendLine("  <para style=\"p\">");
        sb.AppendLine("    <verse number=\"1\" style=\"v\" />");
        sb.AppendLine("And it came to <char style=\"w\">pass</char> <char style=\"w\">in</char> the days </para>");
        sb.AppendLine("</usx>");
        string bookUsxFromParatextData = sb.ToString();
        env.ParatextService.GetBookText(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<int>())
            .Returns(bookUsxFromParatextData);

        // SUT
        Dictionary<int, ChapterDelta> chapterDeltas = env.Runner.GetParatextChaptersAsDeltas(
            textInfo,
            "some-paratext-project-id"
        );
        List<JToken> ops = chapterDeltas.First().Value.Delta.Ops;
        Assert.That(ops[0].First().Path, Is.EqualTo("insert"), "first op unexpectedly not an insert");

        Assert.That(
            ops[0]["insert"].Type,
            Is.EqualTo(JTokenType.Object),
            "first op in list should be inserting an object, not a string like newline"
        );
    }

    [Test]
    public async Task CoreRoundtrip_NoUnexpectedDataChanges()
    {
        // ParatextSyncRunner RunAsync() fetches Paratext data from disk and makes chapter deltas from it. It also
        // writes chapter deltas back to Paratext data on disk. Test that core methods involved in this process
        // roundtrip data successfully. Using a real DeltaUsxMapper, this is an integration test.

        IGuidService mapperGuidService = new TestGuidService();
        ILogger<DeltaUsxMapper> logger = Substitute.For<ILogger<DeltaUsxMapper>>();
        IExceptionHandler exceptionHandler = Substitute.For<IExceptionHandler>();
        DeltaUsxMapper mapper = new(mapperGuidService, logger, exceptionHandler);
        TestEnvironment env = new(false, mapper);

        // Not using something like SetupSFData() because DeltaUsxMapper is not a substitute.
        Book[] books = [new Book("RUT", 8)];
        TextInfo textInfo = new() { BookNum = 8, Chapters = null };

        SFProject[] sfProjects =
        [
            new SFProject
            {
                Id = "project01",
                Name = "project01",
                ShortName = "P01",
                UserRoles = new Dictionary<string, string> { { "user01", SFProjectRole.Administrator }, },
                ParatextId = "pt01",
                IsRightToLeft = false,
                DefaultFontSize = 10,
                DefaultFont = ProjectSettings.defaultFontName,
                TranslateConfig = new TranslateConfig
                {
                    TranslationSuggestionsEnabled = false,
                    Source = new TranslateSource
                    {
                        ParatextId = "source",
                        ProjectRef = "project02",
                        Name = "Source",
                        ShortName = "SRC",
                        WritingSystem = new WritingSystem { Tag = "en" },
                        IsRightToLeft = false
                    },
                    DefaultNoteTagId = 1234
                },
                CheckingConfig = new CheckingConfig
                {
                    CheckingEnabled = true,
                    AnswerExportMethod = CheckingAnswerExport.MarkedForExport,
                    NoteTagId = 1234
                },
                Texts = books.Select(b => textInfo).ToList(),
                Sync = new Sync
                {
                    // QueuedCount is incremented before RunAsync() by SyncService.SyncAsync(). So set
                    // it to 1 to simulate it being incremented.
                    QueuedCount = 1,
                    SyncedToRepositoryVersion = "beforeSR",
                    DataInSync = true
                },
                ParatextUsers =
                [
                    new ParatextUserProfile { OpaqueUserId = "syncuser01", Username = "User 1" },
                    new ParatextUserProfile { OpaqueUserId = "syncuser02", Username = "User 2" }
                ],
                NoteTags = []
            },
        ];
        env.RealtimeService.AddRepository("sf_projects", OTType.Json0, new MemoryRepository<SFProject>(sfProjects));

        // ParatextData will give us Paratext data in USX. Suppose it is the following.
        StringBuilder sb = new();
        sb.AppendLine("<usx version=\"3.0\">");
        sb.AppendLine("  <book code=\"RUT\" style=\"id\">- American Standard Version</book>");
        sb.AppendLine("  <chapter number=\"1\" style=\"c\" />");
        sb.AppendLine("  <para style=\"p\">");
        sb.AppendLine("    <verse number=\"1\" style=\"v\" />");
        sb.AppendLine("And it came to <char style=\"w\">pass</char> <char style=\"w\">in</char> the days</para>");
        sb.AppendLine("</usx>");
        string bookUsxFromParatextData = sb.ToString();

        env.ParatextService.GetBookText(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<int>())
            .Returns(bookUsxFromParatextData);

        // SUT 1. Use GetParatextChaptersAsDeltas to get chapter deltas derived from paratext text.
        Dictionary<int, ChapterDelta> chapterDeltas = env.Runner.GetParatextChaptersAsDeltas(textInfo, "pt01");
        List<JToken> ops = chapterDeltas.First().Value.Delta.Ops;
        Assert.That(ops[0].First().Path, Is.EqualTo("insert"), "first op unexpectedly not an insert");

        Assert.That(
            ops[0]["insert"].Type,
            Is.EqualTo(JTokenType.Object),
            "first op in list should be inserting an object, not a string like newline"
        );

        // We have chapter deltas from the Paratext project USFM. We store the information in SF DB. In a future sync,
        // we would write the SF DB information back to the Paratext project (if the text was changed).

        // Modify the text a bit so it will need written back to Paratext.
        string newText = "In the beginning";
        ops[3]["insert"] = newText;

        // Make text docs out of the chapter deltas.
        var chapterDeltasAsSortedList = new SortedList<int, IDocument<TextData>>(
            chapterDeltas.ToDictionary(
                kvp => kvp.Key,
                kvp =>
                {
                    IDocument<TextData> doc = Substitute.For<IDocument<TextData>>();
                    doc.Data.Returns(new TextData(kvp.Value.Delta));
                    return doc;
                }
            )
        );
        textInfo.Chapters = chapterDeltas
            .Values.Select(
                (ChapterDelta chapterDelta) =>
                    new Chapter()
                    {
                        Number = chapterDelta.Number,
                        IsValid = chapterDelta.IsValid,
                        LastVerse = chapterDelta.LastVerse,
                        Permissions = new Dictionary<string, string>()
                    }
            )
            .ToList();

        env.RealtimeService.AddRepository(
            "users",
            OTType.Json0,
            new MemoryRepository<User>(
                new[]
                {
                    new User { Id = "user01", ParatextId = "pt01" },
                    new User { Id = "user02", ParatextId = "pt02" }
                }
            )
        );

        Assert.That(
            await env.Runner.InitAsync("project01", "user01", "project01", CancellationToken.None),
            Is.True,
            "setup"
        );

        // SUT 2. Write the chapter deltas / text docs back to Paratext. We should write to Paratext the expected
        // content.
        await env.Runner.UpdateParatextBookAsync(textInfo, "pt01", chapterDeltasAsSortedList);

        StringBuilder sb2 = new();
        sb2.AppendLine("<usx version=\"3.0\">");
        sb2.AppendLine("  <book code=\"RUT\" style=\"id\">- American Standard Version</book>");
        sb2.AppendLine("  <chapter number=\"1\" style=\"c\" />");
        sb2.AppendLine("  <para style=\"p\">");
        sb2.AppendLine("    <verse number=\"1\" style=\"v\" />");
        sb2.AppendLine($"{newText}<char style=\"w\">pass</char> <char style=\"w\">in</char> the days</para>");
        sb2.AppendLine("</usx>");
        string expectedUsx = sb2.ToString();

        // The USX sent back to PT should have roundtripped correctly.
        await env
            .ParatextService.Received()
            .PutBookText(
                Arg.Any<UserSecret>(),
                Arg.Any<string>(),
                Arg.Any<int>(),
                Arg.Is((XDocument arg) => XNode.DeepEquals((ParatextSyncRunner.UsxToXDocument(expectedUsx)), (arg))),
                Arg.Any<Dictionary<int, string>>()
            );
    }

    private class Book
    {
        public Book(string bookId, int highestChapter, bool hasSource = true)
            : this(bookId, highestChapter, hasSource ? highestChapter : 0) { }

        public Book(string bookId, int highestTargetChapter, int highestSourceChapter)
        {
            Id = bookId;
            HighestTargetChapter = highestTargetChapter;
            HighestSourceChapter = highestSourceChapter;
        }

        public string Id { get; }
        public int HighestTargetChapter { get; }
        public int HighestSourceChapter { get; }

        public HashSet<int> InvalidChapters { get; } = new HashSet<int>();
        public HashSet<int> MissingTargetChapters { get; set; } = new HashSet<int>();
        public HashSet<int> MissingSourceChapters { get; set; } = new HashSet<int>();
    }

    private class TestEnvironment
    {
        public readonly int translateNoteTagId = 5;
        public readonly int checkingNoteTagId = 6;
        private readonly MemoryRepository<SFProjectSecret> _projectSecrets;
        private readonly MemoryRepository<SyncMetrics> _syncMetrics;
        private bool _sendReceivedCalled = false;
        private readonly int _guidStartNum = 3;

        public static readonly ParatextProjectUser ParatextProjectUser01 = new ParatextProjectUser
        {
            Id = "user01",
            ParatextId = "pt01",
            Role = SFProjectRole.Administrator,
            Username = "User 1",
        };

        public static readonly ParatextProjectUser ParatextProjectUser02 = new ParatextProjectUser
        {
            Id = "user02",
            ParatextId = "pt02",
            Role = SFProjectRole.Translator,
            Username = "User 2",
        };

        public static readonly ParatextProjectUser ParatextProjectUser03 = new ParatextProjectUser
        {
            Id = "user03",
            ParatextId = "pt03",
            Role = SFProjectRole.PTObserver,
            Username = "User 3",
        };

        /// <summary>
        /// Initializes a new instance of the <see cref="TestEnvironment" /> class.
        /// </summary>
        /// <param name="substituteRealtimeService">If set to <c>true</c> use a substitute realtime service rather
        /// than the <see cref="SFMemoryRealtimeService" />.</param>
        public TestEnvironment(bool substituteRealtimeService = false, IDeltaUsxMapper deltaUsxMapper = null)
        {
            var userSecrets = new MemoryRepository<UserSecret>(
                new[]
                {
                    new UserSecret { Id = "user01" },
                    new UserSecret { Id = "user02" },
                }
            );
            _projectSecrets = new MemoryRepository<SFProjectSecret>(
                new[]
                {
                    new SFProjectSecret { Id = "project01", JobIds = ["test_jobid"], },
                    new SFProjectSecret { Id = "project02" },
                    new SFProjectSecret { Id = "project03" },
                    new SFProjectSecret { Id = "project04" },
                    new SFProjectSecret { Id = "project05" },
                }
            );
            _syncMetrics = new MemoryRepository<SyncMetrics>(
                new[]
                {
                    new SyncMetrics { Id = "project01" },
                    new SyncMetrics { Id = "project01_alt1" },
                    new SyncMetrics { Id = "project01_alt2" },
                    new SyncMetrics { Id = "project02" },
                    new SyncMetrics { Id = "project03" },
                    new SyncMetrics { Id = "project04" },
                    new SyncMetrics { Id = "project05" },
                }
            );
            UserService = Substitute.For<IUserService>();
            SFProjectService = Substitute.For<ISFProjectService>();
            ParatextService = Substitute.For<IParatextService>();

            ParatextService
                .GetBiblicalTermsAsync(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<IEnumerable<int>>())
                .Returns(Task.FromResult(new BiblicalTermsChanges()));
            ParatextService
                .GetParatextUsersAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Is((SFProject project) => project.ParatextId == "target"),
                    Arg.Any<CancellationToken>()
                )
                .Returns([ParatextProjectUser01, ParatextProjectUser02]);
            ParatextService
                .When(x =>
                    x.SendReceiveAsync(
                        Arg.Any<UserSecret>(),
                        "target",
                        Arg.Any<IProgress<ProgressState>>(),
                        Arg.Any<CancellationToken>(),
                        Arg.Any<SyncMetrics>()
                    )
                )
                .Do(x =>
                {
                    _sendReceivedCalled = true;
                    ParatextService.GetLatestSharedVersion(Arg.Any<UserSecret>(), Arg.Any<string>()).Returns("afterSR");
                });

            ParatextService.GetNotes(Arg.Any<UserSecret>(), "target", Arg.Any<int>()).Returns("<notes/>");
            ParatextService.GetParatextUsername(Arg.Is<UserSecret>(u => u.Id == "user01")).Returns("User 1");
            ParatextService
                .GetParatextSettings(Arg.Any<UserSecret>(), Arg.Any<string>())
                .Returns(x => new ParatextSettings
                {
                    FullName = (string)x[1],
                    IsRightToLeft = false,
                    Editable = true
                });
            ParatextService.GetLatestSharedVersion(Arg.Any<UserSecret>(), "target").Returns("beforeSR");
            ParatextService.GetLatestSharedVersion(Arg.Any<UserSecret>(), "source").Returns("beforeSR", "afterSR");
            RealtimeService = new SFMemoryRealtimeService();
            Connection = Substitute.For<IConnection>();
            SubstituteRealtimeService = Substitute.For<IRealtimeService>();
            SubstituteRealtimeService.ConnectAsync().Returns(Task.FromResult(Connection));
            DeltaUsxMapper = deltaUsxMapper ?? Substitute.For<IDeltaUsxMapper>();
            NotesMapper = Substitute.For<IParatextNotesMapper>();
            var hubContext = Substitute.For<IHubContext<NotificationHub, INotifier>>();
            MockLogger = new MockLogger<ParatextSyncRunner>();
            GuidService = Substitute.For<IGuidService>();
            GuidService.NewObjectId().Returns($"syncuser0{_guidStartNum++}");

            Runner = new ParatextSyncRunner(
                userSecrets,
                UserService,
                _projectSecrets,
                _syncMetrics,
                SFProjectService,
                ParatextService,
                substituteRealtimeService ? SubstituteRealtimeService : RealtimeService,
                DeltaUsxMapper,
                NotesMapper,
                hubContext,
                MockLogger,
                GuidService
            );
        }

        public ParatextSyncRunner Runner { get; }
        public IUserService UserService { get; }
        public ISFProjectService SFProjectService { get; }
        public IParatextNotesMapper NotesMapper { get; }
        public IParatextService ParatextService { get; }
        public SFMemoryRealtimeService RealtimeService { get; }
        public IRealtimeService SubstituteRealtimeService { get; }
        public IDeltaUsxMapper DeltaUsxMapper { get; }
        public MockLogger<ParatextSyncRunner> MockLogger { get; }
        public IGuidService GuidService { get; }

        /// <summary>
        /// Gets the connection to be used with <see cref="SubstituteRealtimeService"/>.
        /// </summary>
        public IConnection Connection { get; }

        public SFProject GetProject(string projectSFId = "project01") =>
            RealtimeService.GetRepository<SFProject>().Get(projectSFId);

        public SFProjectSecret GetProjectSecret(string projectId = "project01") => _projectSecrets.Get(projectId);

        public bool ContainsText(string projectId, string bookId, int chapter) =>
            RealtimeService
                .GetRepository<TextData>()
                .Contains(TextData.GetTextDocId(projectId, Canon.BookIdToNumber(bookId), chapter));

        /// <summary>
        /// Fetches the text docs for a book.
        /// </summary>
        public async Task<SortedList<int, IDocument<TextData>>> FetchTextDocsAsync(TextInfo text)
        {
            var textDocs = new SortedList<int, IDocument<TextData>>();
            foreach (Chapter chapter in text.Chapters)
            {
                IDocument<TextData> textDoc = Runner.GetTextDoc(text, chapter.Number);
                await textDoc.FetchAsync();
                if (textDoc.IsLoaded)
                {
                    textDocs[chapter.Number] = textDoc;
                }
            }

            return textDocs;
        }

        public TextData GetText(string projectId, string bookId, int chapter)
        {
            return RealtimeService
                .GetRepository<TextData>()
                .Get(TextData.GetTextDocId(projectId, Canon.BookIdToNumber(bookId), chapter));
        }

        public bool ContainsQuestion(string bookId, int chapter) =>
            RealtimeService.GetRepository<Question>().Contains($"project01:question{bookId}{chapter}");

        public bool ContainsQuestion(string projectId, string bookId, int chapter) =>
            RealtimeService.GetRepository<Question>().Contains($"{projectId}:question{bookId}{chapter}");

        public bool ContainsNote(int threadNum) =>
            RealtimeService.GetRepository<NoteThread>().Contains($"project01:dataId0{threadNum}");

        public Question GetQuestion(string bookId, int chapter) =>
            RealtimeService.GetRepository<Question>().Get($"project01:question{bookId}{chapter}");

        public bool ContainsNoteThread(string projectId, string dataId) =>
            RealtimeService.GetRepository<NoteThread>().Contains($"{projectId}:{dataId}");

        public NoteThread GetNoteThread(string projectId, string dataId) =>
            RealtimeService.GetRepository<NoteThread>().Get($"{projectId}:{dataId}");

        public SyncMetrics GetSyncMetrics(string projectId) => _syncMetrics.Get(projectId);

        public SFProject AssertDBSyncMetadata(
            string projectSFId,
            bool lastSyncSuccess,
            string? syncedToRepositoryVersion
        )
        {
            SFProjectSecret projectSecret = GetProjectSecret(projectSFId);
            Assert.That(projectSecret.JobIds.Count, Is.EqualTo(0));
            SFProject project = GetProject(projectSFId);
            Assert.That(project.Sync.QueuedCount, Is.EqualTo(0));
            Assert.That(project.Sync.LastSyncSuccessful, Is.EqualTo(lastSyncSuccess));
            Assert.That(project.Sync.SyncedToRepositoryVersion, Is.EqualTo(syncedToRepositoryVersion));

            // Check for the correct system metrics status
            SyncMetrics syncMetrics = GetSyncMetrics(projectSFId);
            if (lastSyncSuccess)
            {
                Assert.That(syncMetrics.Status, Is.EqualTo(SyncStatus.Successful));
            }
            else
            {
                Assert.That(syncMetrics.Status, Is.InRange(SyncStatus.Cancelled, SyncStatus.Failed));
            }

            return project;
        }

        public SFProject VerifyProjectSync(
            bool successful,
            string? expectedRepoVersion = null,
            string projectSFId = "project01"
        )
        {
            string repoVersion = expectedRepoVersion ?? (successful ? "afterSR" : "beforeSR");
            return AssertDBSyncMetadata(projectSFId, successful, repoVersion);
        }

        public TextInfo SetupChapterAuthorsAndGetTextInfo(bool setChapterPermissions)
        {
            string projectId = "project01";
            int bookNum = 70;
            int chapterNum = 1;
            string id = TextData.GetTextDocId(projectId, bookNum, chapterNum);
            Dictionary<string, string> chapterPermissions = new Dictionary<string, string>();
            if (setChapterPermissions)
            {
                chapterPermissions.Add("user01", TextInfoPermission.Write);
                chapterPermissions.Add("user02", TextInfoPermission.Read);
            }
            var textInfo = new TextInfo
            {
                BookNum = bookNum,
                Chapters = new List<Chapter>
                {
                    new Chapter { Number = chapterNum, Permissions = chapterPermissions, },
                },
            };
            RealtimeService.AddRepository(
                "users",
                OTType.Json0,
                new MemoryRepository<User>(new[] { new User { Id = "user01" }, })
            );
            RealtimeService.AddRepository(
                "texts",
                OTType.RichText,
                new MemoryRepository<TextData>(new[] { new TextData(Delta.New()) { Id = id }, })
            );
            SFProject[] sfProjects = new[]
            {
                new SFProject
                {
                    Id = projectId,
                    UserRoles = new Dictionary<string, string>
                    {
                        { "user03", SFProjectRole.Administrator },
                        { "user04", SFProjectRole.Translator },
                    },
                },
            };
            RealtimeService.AddRepository("sf_projects", OTType.Json0, new MemoryRepository<SFProject>(sfProjects));
            MockProjectDirsExist(sfProjects.Select((SFProject proj) => proj.ParatextId));

            return textInfo;
        }

        public void SetupSFData(
            bool translationSuggestionsEnabled,
            bool checkingEnabled,
            bool changed,
            bool noteOnFirstBook,
            params Book[] books
        )
        {
            SetupSFData(
                "project01",
                "project02",
                translationSuggestionsEnabled,
                checkingEnabled,
                changed,
                noteOnFirstBook,
                books
            );
        }

        public void SetupSFData(
            string targetProjectSFId,
            string sourceProjectSFId,
            bool translationSuggestionsEnabled,
            bool checkingEnabled,
            bool changed,
            bool noteOnFirstBook,
            params Book[] books
        )
        {
            RealtimeService.AddRepository(
                "users",
                OTType.Json0,
                new MemoryRepository<User>(
                    new[]
                    {
                        new User { Id = "user01", ParatextId = "pt01" },
                        new User { Id = "user02", ParatextId = "pt02" }
                    }
                )
            );
            // It is expected that if a user is on a project, there is a corresponding project-user-config doc.
            RealtimeService.AddRepository(
                "sf_project_user_configs",
                OTType.Json0,
                new MemoryRepository<SFProjectUserConfig>(
                    new[]
                    {
                        new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId("project01", "user01"), },
                        new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId("project01", "user02"), }
                    }
                )
            );
            SFProject[] sfProjects = new[]
            {
                new SFProject
                {
                    Id = "project01",
                    Name = "project01",
                    ShortName = "P01",
                    UserRoles = new Dictionary<string, string>
                    {
                        { "user01", SFProjectRole.Administrator },
                        { "user02", SFProjectRole.Translator },
                        { "user03", SFProjectRole.Commenter }
                    },
                    ParatextId = "target",
                    IsRightToLeft = false,
                    DefaultFontSize = 10,
                    DefaultFont = ProjectSettings.defaultFontName,
                    TranslateConfig = new TranslateConfig
                    {
                        TranslationSuggestionsEnabled = translationSuggestionsEnabled,
                        Source = new TranslateSource
                        {
                            ParatextId = "source",
                            ProjectRef = "project02",
                            Name = "Source",
                            ShortName = "SRC",
                            WritingSystem = new WritingSystem { Tag = "en" },
                            IsRightToLeft = false
                        },
                        DefaultNoteTagId = translateNoteTagId
                    },
                    CheckingConfig = new CheckingConfig
                    {
                        CheckingEnabled = checkingEnabled,
                        AnswerExportMethod = CheckingAnswerExport.MarkedForExport,
                        NoteTagId = checkingNoteTagId
                    },
                    Texts = books.Select(b => TextInfoFromBook(b)).ToList(),
                    Sync = new Sync
                    {
                        // QueuedCount is incremented before RunAsync() by SyncService.SyncAsync(). So set
                        // it to 1 to simulate it being incremented.
                        QueuedCount = 1,
                        SyncedToRepositoryVersion = "beforeSR",
                        DataInSync = true
                    },
                    ParatextUsers = new List<ParatextUserProfile>
                    {
                        new ParatextUserProfile
                        {
                            OpaqueUserId = "syncuser01",
                            Username = "User 1",
                            SFUserId = "user01"
                        },
                        new ParatextUserProfile { OpaqueUserId = "syncuser02", Username = "User 2" }
                    },
                    NoteTags = new List<NoteTag>()
                },
                new SFProject
                {
                    Id = "project02",
                    Name = "Source",
                    ShortName = "SRC",
                    UserRoles = new Dictionary<string, string>(),
                    ParatextId = "source",
                    IsRightToLeft = false,
                    TranslateConfig = new TranslateConfig { TranslationSuggestionsEnabled = false },
                    NoteTags = new List<NoteTag>(),
                    CheckingConfig = new CheckingConfig
                    {
                        CheckingEnabled = checkingEnabled,
                        AnswerExportMethod = CheckingAnswerExport.MarkedForExport,
                    },
                    WritingSystem = new WritingSystem { Tag = "en" },
                    Texts = books.Select(b => TextInfoFromBook(b)).ToList(),
                    Sync = new Sync { QueuedCount = 0, SyncedToRepositoryVersion = "beforeSR" }
                },
                new SFProject
                {
                    // This project was not sync'd since we started tracking SyncedToRepositoryVersion when
                    // a 2021-05-14 commit reached sf-live.
                    Id = "project03",
                    Name = "project03withNoSyncedToRepositoryVersion",
                    ShortName = "P03",
                    UserRoles = new Dictionary<string, string>
                    {
                        { "user01", SFProjectRole.Administrator },
                        { "user02", SFProjectRole.Translator }
                    },
                    ParatextId = "paratext-project03",
                    IsRightToLeft = false,
                    TranslateConfig = new TranslateConfig
                    {
                        TranslationSuggestionsEnabled = translationSuggestionsEnabled,
                        Source = new TranslateSource
                        {
                            ParatextId = "paratext-project04",
                            ProjectRef = "project04",
                            Name = "project04",
                            ShortName = "P04",
                            WritingSystem = new WritingSystem { Tag = "en" },
                            IsRightToLeft = false
                        }
                    },
                    CheckingConfig = new CheckingConfig
                    {
                        CheckingEnabled = checkingEnabled,
                        AnswerExportMethod = CheckingAnswerExport.MarkedForExport
                    },
                    Texts = books.Select(b => TextInfoFromBook(b)).ToList(),
                    Sync = new Sync
                    {
                        QueuedCount = 1,
                        // No SyncedToRepositoryVersion
                        // No DataInSync
                    },
                },
                new SFProject
                {
                    Id = "project04",
                    Name = "project04",
                    ShortName = "P04",
                    UserRoles = new Dictionary<string, string>(),
                    ParatextId = "paratext-project04",
                    IsRightToLeft = false,
                    TranslateConfig = new TranslateConfig { TranslationSuggestionsEnabled = false },
                    CheckingConfig = new CheckingConfig
                    {
                        CheckingEnabled = checkingEnabled,
                        AnswerExportMethod = CheckingAnswerExport.MarkedForExport
                    },
                    WritingSystem = new WritingSystem { Tag = "en" },
                    Texts = books.Select(b => TextInfoFromBook(b)).ToList(),
                    Sync = new Sync
                    {
                        QueuedCount = 0,
                        // No SyncedToRepositoryVersion
                        // No DataInSync
                    }
                },
                new SFProject
                {
                    // This project was sync'd after we started tracking SyncedToRepositoryVersion, but the
                    // only sync attempt triggered a failure, and so only DataInSync was written to,
                    // not SyncedToRepositoryVersion.
                    Id = "project05",
                    Name = "project05",
                    ShortName = "P05",
                    UserRoles = new Dictionary<string, string>
                    {
                        { "user01", SFProjectRole.Administrator },
                        { "user02", SFProjectRole.Translator }
                    },
                    ParatextId = "paratext-project05",
                    IsRightToLeft = false,
                    TranslateConfig = new TranslateConfig
                    {
                        TranslationSuggestionsEnabled = translationSuggestionsEnabled,
                        Source = new TranslateSource
                        {
                            ParatextId = "paratext-project04",
                            ProjectRef = "project04",
                            Name = "project04",
                            ShortName = "P04",
                            WritingSystem = new WritingSystem { Tag = "en" },
                            IsRightToLeft = false
                        }
                    },
                    CheckingConfig = new CheckingConfig
                    {
                        CheckingEnabled = checkingEnabled,
                        AnswerExportMethod = CheckingAnswerExport.MarkedForExport
                    },
                    Texts = books.Select(b => TextInfoFromBook(b)).ToList(),
                    Sync = new Sync
                    {
                        QueuedCount = 1,
                        DataInSync = false
                        // No SyncedToRepositoryVersion
                    },
                    NoteTags = new List<NoteTag>()
                },
            };
            RealtimeService.AddRepository("sf_projects", OTType.Json0, new MemoryRepository<SFProject>(sfProjects));
            MockProjectDirsExist(sfProjects.Select((SFProject proj) => proj.ParatextId));

            RealtimeService.AddRepository("texts", OTType.RichText, new MemoryRepository<TextData>());
            RealtimeService.AddRepository("questions", OTType.Json0, new MemoryRepository<Question>());
            RealtimeService.AddRepository("biblical_terms", OTType.Json0, new MemoryRepository<BiblicalTerm>());
            if (noteOnFirstBook && books.Length > 0)
            {
                Book[] book = new[] { books[0] };
                AddParatextNoteThreadData(book);
            }
            else
                SetupEmptyNoteThreads();
            foreach (Book book in books)
            {
                AddSFBook(
                    targetProjectSFId,
                    GetProject(targetProjectSFId).ParatextId,
                    book.Id,
                    book.HighestTargetChapter,
                    changed,
                    book.MissingTargetChapters
                );
                if (book.HighestSourceChapter > 0)
                {
                    AddSFBook(
                        sourceProjectSFId,
                        GetProject(sourceProjectSFId).ParatextId,
                        book.Id,
                        book.HighestSourceChapter,
                        changed,
                        book.MissingSourceChapters
                    );
                }
            }

            var notesElem = new XElement("notes");
            if (changed)
            {
                notesElem.Add(new XElement("thread"));
            }

            NotesMapper
                .GetNotesChangelistAsync(
                    Arg.Any<XElement>(),
                    Arg.Any<IEnumerable<IDocument<Question>>>(),
                    Arg.Any<Dictionary<string, ParatextUserProfile>>(),
                    Arg.Any<Dictionary<string, string>>(),
                    CheckingAnswerExport.MarkedForExport,
                    Arg.Any<int>()
                )
                .Returns(Task.FromResult(notesElem));
        }

        public static TextInfo TextInfoFromBook(Book book)
        {
            return new TextInfo
            {
                BookNum = Canon.BookIdToNumber(book.Id),
                Chapters = Enumerable
                    .Range(1, book.HighestTargetChapter)
                    .Select(c => new Chapter
                    {
                        Number = c,
                        LastVerse = 10,
                        IsValid = !book.InvalidChapters.Contains(c),
                        Permissions = { }
                    })
                    .ToList(),
                HasSource = book.HighestSourceChapter > 0
            };
        }

        public void SetupPTData(params Book[] books) => SetupPTDataForProjectIds("target", "source", books);

        public void SetupPTData(string targetProjectPTId, params Book[] books) =>
            SetupPTDataForProjectIds(targetProjectPTId, "sourceProjectPTId", books);

        public void SetupPTDataForProjectIds(string targetProjectPTId, string sourceProjectPTId, params Book[] books)
        {
            ParatextService
                .GetBookList(Arg.Any<UserSecret>(), targetProjectPTId)
                .Returns(books.Select(b => Canon.BookIdToNumber(b.Id)).ToArray());
            // Include book with Source even if there are no chapters, if there are also no chapters in Target. PT
            // can actually have or not have books which do or do not have chapters more flexibly than this. But in
            // this way, allow tests to request a Source book exist even with zero chapters.
            ParatextService
                .GetBookList(Arg.Any<UserSecret>(), sourceProjectPTId)
                .Returns(
                    books
                        .Where(b => b.HighestSourceChapter > 0 || b.HighestSourceChapter == b.HighestTargetChapter)
                        .Select(b => Canon.BookIdToNumber(b.Id))
                        .ToArray()
                );
            foreach (Book book in books)
            {
                AddPTBook(
                    targetProjectPTId,
                    book.Id,
                    book.HighestTargetChapter,
                    book.MissingTargetChapters,
                    book.InvalidChapters
                );
                if (book.HighestSourceChapter > 0 || book.HighestSourceChapter == book.HighestTargetChapter)
                    AddPTBook(sourceProjectPTId, book.Id, book.HighestSourceChapter, book.MissingSourceChapters);
            }
        }

        public Task SetUserRole(string userId, string role)
        {
            return RealtimeService
                .GetRepository<SFProject>()
                .UpdateAsync(p => p.Id == "project01", u => u.Set(pr => pr.UserRoles[userId], role));
        }

        public void SetupNoteChanges(
            string dataId,
            string threadId,
            string verseRef = "MAT 1:1",
            bool fromParatext = true
        )
        {
            if (fromParatext)
            {
                var noteThreadChange = new NoteThreadChange(
                    dataId,
                    threadId,
                    verseRef,
                    $"Scripture text in project",
                    "Context before ",
                    " context after",
                    NoteStatus.Todo.InternalValue,
                    ""
                )
                {
                    ThreadUpdated = true,
                    Position = new TextAnchor { Start = 0, Length = 0 },
                    Assignment = CommentThread.teamUser
                };
                noteThreadChange.AddChange(
                    CreateNote(threadId, "n01", "syncuser01", $"{threadId} updated.", ChangeType.Updated, null, 2),
                    ChangeType.Updated
                );
                noteThreadChange.AddChange(
                    CreateNote(threadId, "n02", "syncuser02", $"{threadId} deleted.", ChangeType.Deleted),
                    ChangeType.Deleted
                );
                noteThreadChange.AddChange(
                    CreateNote(threadId, "n03", "syncuser03", $"{threadId} added.", ChangeType.Added, 3),
                    ChangeType.Added
                );

                ParatextService
                    .GetNoteThreadChanges(
                        Arg.Any<UserSecret>(),
                        "target",
                        40,
                        Arg.Any<IEnumerable<IDocument<NoteThread>>>(),
                        Arg.Any<Dictionary<int, ChapterDelta>>(),
                        Arg.Any<Dictionary<string, ParatextUserProfile>>()
                    )
                    .Returns(new[] { noteThreadChange });
                ParatextService
                    .GetParatextUsersAsync(Arg.Any<UserSecret>(), Arg.Any<SFProject>(), CancellationToken.None)
                    .Returns([ParatextProjectUser01, ParatextProjectUser02, ParatextProjectUser03]);
            }
        }

        public void SetupNoteStatusChange(string dataId, string threadId, string status, string verseRef = "MAT 1:1")
        {
            var noteThreadChange = new NoteThreadChange(
                dataId,
                threadId,
                verseRef,
                $"{threadId} selected text.",
                "Context before ",
                " context after",
                status,
                ""
            )
            {
                ThreadUpdated = true
            };
            SetupNoteThreadChanges(new[] { noteThreadChange }, "target", 40);
        }

        public void SetupNewNoteThreadChange(string threadId, string syncUserId, string verseRef = "MAT 1:1")
        {
            var noteThreadChange = new NoteThreadChange(
                null,
                threadId,
                verseRef,
                $"Scripture text in project",
                "Context before ",
                " context after",
                NoteStatus.Todo.InternalValue,
                ""
            )
            {
                Position = new TextAnchor { Start = 0, Length = 0 },
                Assignment = CommentThread.teamUser
            };
            noteThreadChange.AddChange(
                CreateNote(threadId, "n01", syncUserId, $"New {threadId} added.", ChangeType.Added),
                ChangeType.Added
            );
            SetupNoteThreadChanges(new[] { noteThreadChange }, "target", 40);
        }

        public void SetupNewConflictNoteThreadChange(string threadId, string verseRef = "MAT 1:1")
        {
            var noteThreadChange = new NoteThreadChange(
                null,
                threadId,
                verseRef,
                null,
                null,
                null,
                NoteStatus.Todo.InternalValue,
                ""
            )
            {
                Position = new TextAnchor { Start = 0, Length = 0 }
            };
            noteThreadChange.AddChange(
                CreateNote(threadId, "conflict1", "", "Conflict on note.", ChangeType.Added, CommentTag.conflictTagId),
                ChangeType.Added
            );
            SetupNoteThreadChanges(new[] { noteThreadChange }, "target", 40);
        }

        public void SetupNoteRemovedChange(
            string dataId,
            string threadId,
            string[] noteIds,
            string verseRef = "MAT 1:1"
        )
        {
            var noteThreadChange = new NoteThreadChange(
                dataId,
                threadId,
                verseRef,
                $"{threadId} selected text.",
                "Context before ",
                " context after",
                NoteStatus.Resolved.InternalValue,
                ""
            )
            {
                NoteIdsRemoved = new List<string>(noteIds)
            };
            SetupNoteThreadChanges(new[] { noteThreadChange }, "target", 40);
        }

        public void SetupNoteReattachedChange(string dataId, string threadId, string verseRef)
        {
            var noteThreadChange = new NoteThreadChange(
                dataId,
                threadId,
                verseRef,
                $"{threadId} selected text.",
                "Context before ",
                " context after",
                "",
                ""
            );
            string before = "Reattach before ";
            string reattachSelectedText = "reattach selected text";
            int start = before.Length;
            int length = reattachSelectedText.Length;
            noteThreadChange.Position = new TextAnchor { Start = start, Length = length };
            string[] reattachParts = { verseRef, reattachSelectedText, start.ToString(), before, " reattach after." };
            string reattached = string.Join(PtxUtils.StringUtils.orcCharacter, reattachParts);
            Note reattachedNote = CreateNote(threadId, "reattached01", "syncuser01", null, ChangeType.Added);
            reattachedNote.Reattached = reattached;
            noteThreadChange.AddChange(reattachedNote, ChangeType.Added);
            ParatextService
                .GetNoteThreadChanges(
                    Arg.Any<UserSecret>(),
                    "target",
                    40,
                    Arg.Any<IEnumerable<IDocument<NoteThread>>>(),
                    Arg.Any<Dictionary<int, ChapterDelta>>(),
                    Arg.Any<Dictionary<string, ParatextUserProfile>>()
                )
                .Returns(new[] { noteThreadChange });
        }

        /// <summary>Prepare a change report to be provided when thread changes are asked for.</summary>
        public void SetupThreadAndNoteChange(
            string dataId,
            string threadId,
            Action<NoteThreadChange> modifyNoteThreadChange,
            Action<Note> modifyNoteChange
        )
        {
            string status = NoteStatus.Todo.InternalValue;
            string verseRef = "MAT 1:1";
            // Create a NoteThreadChange, and allow client to adjust it.
            var noteThreadChange = new NoteThreadChange(dataId, threadId, verseRef, null, null, null, status, "");
            modifyNoteThreadChange?.Invoke(noteThreadChange);
            Note note = CreateNoteSimple(threadId, "n01");
            if (modifyNoteChange != null)
            {
                modifyNoteChange(note);
                ChangeType changeType = ChangeType.Updated;
                noteThreadChange.AddChange(note, changeType);
            }

            // Cause the created NoteThreadChange to be what is given when changes are asked for.
            SetupNoteThreadChanges(new[] { noteThreadChange }, "target", 40);
        }

        /// <summary> Set the project's default comment tag to the a blank comment tag. </summary>
        public Task SetupUndefinedNoteTag(string projectId, bool forChecking)
        {
            if (forChecking)
            {
                return RealtimeService
                    .GetRepository<SFProject>()
                    .UpdateAsync(p => p.Id == projectId, u => u.Unset(p => p.CheckingConfig.NoteTagId));
            }
            return RealtimeService
                .GetRepository<SFProject>()
                .UpdateAsync(p => p.Id == projectId, u => u.Unset(p => p.TranslateConfig.DefaultNoteTagId));
        }

        public Task SetupProjectNoteTags(string projectId, List<NoteTag> noteTags)
        {
            return RealtimeService
                .GetRepository<SFProject>()
                .UpdateAsync(p => p.Id == projectId, u => u.Set(p => p.NoteTags, noteTags));
        }

        public Task AddAnswerToQuestion(string projectId, string bookId, int chapter)
        {
            string id = $"{projectId}:question{bookId}{chapter}";
            var answer = new Answer { DataId = "answer01", Status = AnswerStatus.Exportable };
            return RealtimeService
                .GetRepository<Question>()
                .UpdateAsync(q => q.Id == id, u => u.Add(q => q.Answers, answer));
        }

        /// <summary>
        /// Helper method to test the simple case of a note property change being received from PT, and getting
        /// applied to the SF DB.
        /// </summary>>
        public async Task SimpleNoteChangeAppliedCheckerAsync<T>(
            Func<Note, T> datumGetter,
            Action<Note, T> datumSetter,
            T newData
        )
        {
            // Set up some PT and SF project data, including a note.
            string projectId = "project01";
            var book = new Book("MAT", 3, true);
            SetupSFData(true, false, false, true, book);
            SetupPTData(book);
            string dataId = "dataId01";
            string threadId = "thread01";
            NoteThread thread03 = GetNoteThread(projectId, dataId);
            Note note = thread03.Notes[0];
            // Check that the updated data that we will be checking for, is not already set in SF DB.
            Assert.That(datumGetter(note), Is.Not.EqualTo(newData), "setup");

            // Let the client code define the incoming note change from PT.
            SetupThreadAndNoteChange(dataId, threadId, null, (Note note) => datumSetter(note, newData));

            // SUT
            await Runner.RunAsync(projectId, "user01", projectId, false, CancellationToken.None);

            thread03 = GetNoteThread(projectId, dataId);
            note = thread03.Notes[0];
            // The Note in SF DB should have been updated as a result of the incoming change from PT.
            Assert.That(datumGetter(note), Is.EqualTo(newData));
        }

        public void AddParatextNoteThreadData(
            Book[] books,
            bool publishedToSF = false,
            bool fromCommenter = false,
            bool biblicalTermNote = false
        )
        {
            NoteThread[] noteThreads = new NoteThread[books.Length];
            for (int i = 0; i < books.Length; i++)
            {
                string suffix = (i + 1).ToString("00");
                string threadId = $"thread{suffix}";
                string dataId = $"dataId{suffix}";
                Book book = books[i];
                int chapter = book.HighestTargetChapter;
                const int tagId = CommentTag.toDoTagId;

                noteThreads[i] = new NoteThread
                {
                    Id = $"project01:{dataId}",
                    DataId = dataId,
                    ThreadId = threadId,
                    ProjectRef = "project01",
                    OwnerRef = fromCommenter ? "user03" : "user01",
                    VerseRef = new VerseRefData(Canon.BookIdToNumber(book.Id), chapter, 1),
                    OriginalContextBefore = "Context before ",
                    OriginalContextAfter = " context after",
                    OriginalSelectedText = "Scripture text in project",
                    PublishedToSF = publishedToSF,
                    Notes = new List<Note>
                    {
                        new Note
                        {
                            DataId = "n01",
                            ThreadId = threadId,
                            OwnerRef = fromCommenter ? "user03" : "user01",
                            SyncUserRef = "syncuser01",
                            Content = "SF note 1.",
                            TagId = tagId,
                            DateCreated = new DateTime(2019, 1, 1, 8, 0, 0, DateTimeKind.Utc),
                            Editable = true,
                            VersionNumber = 1,
                        },
                        new Note
                        {
                            DataId = "n02",
                            ThreadId = threadId,
                            OwnerRef = fromCommenter ? "user03" : "user02",
                            SyncUserRef = "syncuser02",
                            Content = "Paratext note 2.",
                            TagId = tagId,
                            DateCreated = new DateTime(2019, 1, 1, 8, 0, 0, DateTimeKind.Utc),
                        },
                    },
                };
                if (biblicalTermNote)
                {
                    noteThreads[i].BiblicalTermId = $"biblicalTerm{suffix}";
                    noteThreads[i].ExtraHeadingInfo = new BiblicalTermNoteHeadingInfo
                    {
                        Gloss = $"gloss{suffix}",
                        Language = $"language{suffix}",
                        Lemma = $"lemma{suffix}",
                        Transliteration = $"transliteration{suffix}",
                    };
                }
            }
            RealtimeService.AddRepository("note_threads", OTType.Json0, new MemoryRepository<NoteThread>(noteThreads));
        }

        public async Task SetThreadNotesAsync(string sfProjectId, string dataId, List<Note> notes)
        {
            string threadDocId = NoteThread.GetDocId(sfProjectId, dataId);
            await RealtimeService
                .GetRepository<NoteThread>()
                .UpdateAsync(thread => thread.Id == threadDocId, update => update.Set(thread => thread.Notes, notes));
        }

        public void SetupEmptyNoteThreads() =>
            RealtimeService.AddRepository("note_threads", OTType.Json0, new MemoryRepository<NoteThread>());

        public SFProject SetupProjectWithExpectedImportedRev(
            string projectSFId,
            string? startingDBSyncedToRepositoryVersion
        )
        {
            Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
            bool translationSuggestionsEnabled = false;
            bool checkingEnabled = true;
            bool changed = true;
            bool hasNoteThreads = false;
            SetupSFData(
                targetProjectSFId: projectSFId,
                sourceProjectSFId: "project04",
                translationSuggestionsEnabled,
                checkingEnabled,
                changed,
                hasNoteThreads,
                books
            );
            SFProject project = GetProject(projectSFId);
            SetupPTDataForProjectIds(project.ParatextId, GetProject("project04").ParatextId, books);
            Assert.That(
                project.Sync.SyncedToRepositoryVersion,
                Is.EqualTo(startingDBSyncedToRepositoryVersion),
                "setup"
            );
            return project;
        }

        public async Task RunAndAssertAbortAsync(
            string projectSFId,
            string userId,
            string finalDBSyncedToRepositoryVersion
        )
        {
            // SUT
            await Runner.RunAsync(
                projectSFId,
                userId,
                syncMetricsId: projectSFId,
                trainEngine: false,
                token: CancellationToken.None
            );

            // We are in an out-of-sync situation and so should not be writing to PT.

            // Should not be preparing to write data to the PT hg repo.
            ParatextService.DidNotReceiveWithAnyArgs().GetBookText(default, default, default);
            DeltaUsxMapper.DidNotReceiveWithAnyArgs().ToUsx(Arg.Any<XDocument>(), Arg.Any<IEnumerable<ChapterDelta>>());
            ParatextService.DidNotReceiveWithAnyArgs().GetNotes(default, default, default);
            await NotesMapper
                .DidNotReceiveWithAnyArgs()
                .GetNotesChangelistAsync(
                    Arg.Any<XElement>(),
                    Arg.Any<IEnumerable<IDocument<Question>>>(),
                    Arg.Any<Dictionary<string, ParatextUserProfile>>(),
                    Arg.Any<Dictionary<string, string>>(),
                    CheckingAnswerExport.MarkedForExport,
                    Arg.Any<int>()
                );

            // Should not be performing a SR.
            await ParatextService
                .DidNotReceiveWithAnyArgs()
                .SendReceiveAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Any<string>(),
                    Arg.Any<IProgress<ProgressState>>(),
                    Arg.Any<CancellationToken>(),
                    Arg.Any<SyncMetrics>()
                );

            // Record of sync is of not success.
            AssertDBSyncMetadata(
                projectSFId,
                lastSyncSuccess: false,
                syncedToRepositoryVersion: finalDBSyncedToRepositoryVersion
            );
        }

        public async Task RunAndAssertContinuesAsync(
            string projectSFId,
            string userId,
            string? finalDBSyncedToRepositoryVersion
        )
        {
            // SUT
            await Runner.RunAsync(
                projectSFId,
                userId,
                syncMetricsId: projectSFId,
                trainEngine: false,
                token: CancellationToken.None
            );

            // We are not in an out-of-sync situation and should proceed with the sync.

            // Should be preparing to write data to the PT hg repo.
            ParatextService.Received().GetBookText(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<int>());
            DeltaUsxMapper.Received().ToUsx(Arg.Any<XDocument>(), Arg.Any<IEnumerable<ChapterDelta>>());
            ParatextService.Received().GetNotes(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<int>());
            await NotesMapper
                .Received()
                .GetNotesChangelistAsync(
                    Arg.Any<XElement>(),
                    Arg.Any<IEnumerable<IDocument<Question>>>(),
                    Arg.Any<Dictionary<string, ParatextUserProfile>>(),
                    Arg.Any<Dictionary<string, string>>(),
                    CheckingAnswerExport.MarkedForExport,
                    Arg.Any<int>()
                );

            // Should be performing a SR.
            await ParatextService
                .Received(1)
                .SendReceiveAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Any<string>(),
                    Arg.Any<IProgress<ProgressState>>(),
                    Arg.Any<CancellationToken>(),
                    Arg.Any<SyncMetrics>()
                );

            // Record of sync is of success.
            AssertDBSyncMetadata(
                projectSFId,
                lastSyncSuccess: true,
                syncedToRepositoryVersion: finalDBSyncedToRepositoryVersion
            );
        }

        /// <summary>
        /// XDocument.ToString() sometimes pretty-prints the output, such as with indentation that is not from actual
        /// text nodes in the document. Conversely, this method returns a string representation of an XDocument without
        /// formatting, which can be useful when paying attention to what whitespace is really in the XDocument.
        /// </summary>
        public static string XDocumentToStringUnformatted(XDocument inputUsx)
        {
            using MemoryStream stream = new();
            inputUsx.Save(stream, SaveOptions.DisableFormatting);
            byte[] rawBytes = stream.ToArray();
            string usx = System.Text.Encoding.UTF8.GetString(rawBytes);
            // The usx element starts after a BOM and xml declaration.
            string endOfDeclaration = "?>";
            int start = usx.IndexOf(endOfDeclaration) + endOfDeclaration.Length;
            usx = usx[start..];
            return usx;
        }

        /// <summary>Cause mocks to report that the project dirs exist for specified project
        /// PT ids.</summary>
        private void MockProjectDirsExist(IEnumerable<string> projectPTIds)
        {
            ParatextService
                .LocalProjectDirExists(Arg.Is<string>((string projectPTId) => projectPTIds.Contains(projectPTId)))
                .Returns(true);
        }

        private void AddPTBook(
            string paratextId,
            string bookId,
            int highestChapter,
            HashSet<int> missingChapters,
            HashSet<int>? invalidChapters = null
        )
        {
            MockGetBookText(paratextId, bookId);
            Func<XDocument, bool> predicate = d =>
                (string)d?.Root?.Element("book")?.Attribute("code") == bookId
                && (string)d?.Root?.Element("book") == paratextId;
            var chapterDeltas = new List<ChapterDelta>();
            for (int i = 1; i <= highestChapter; i++)
            {
                if (!missingChapters.Contains(i))
                {
                    chapterDeltas.Add(
                        new ChapterDelta(
                            i,
                            10,
                            !(invalidChapters?.Contains(i) ?? false),
                            Delta.New().InsertText("text")
                        )
                    );
                }
            }

            if (!chapterDeltas.Any())
            {
                // Add implicit ChapterDelta, mimicking DeltaUsxMapper.ToChapterDeltas().
                chapterDeltas.Add(new ChapterDelta(1, 0, true, Delta.New()));
            }

            DeltaUsxMapper.ToChapterDeltas(Arg.Is<XDocument>(d => predicate(d))).Returns(chapterDeltas);
        }

        private void AddSFBook(
            string projectId,
            string paratextId,
            string bookId,
            int highestChapter,
            bool changed,
            HashSet<int> missingChapters = null
        )
        {
            MockGetBookText(paratextId, bookId);
            int bookNum = Canon.BookIdToNumber(bookId);
            string newBookText = GetBookText(paratextId, bookId, changed ? 2 : 1);
            Func<XDocument, bool> predicate = d =>
                (string)d?.Root?.Element("book")?.Attribute("code") == bookId
                && (string)d?.Root?.Element("book") == paratextId;
            DeltaUsxMapper
                .ToUsx(Arg.Is<XDocument>(d => predicate(d)), Arg.Any<IEnumerable<ChapterDelta>>())
                .Returns(XDocument.Parse(newBookText));

            for (int c = 1; c <= highestChapter; c++)
            {
                string id = TextData.GetTextDocId(projectId, bookNum, c);
                if (!(missingChapters?.Contains(c) ?? false))
                {
                    RealtimeService
                        .GetRepository<TextData>()
                        .Add(new TextData(Delta.New().InsertText(changed ? "changed" : "text")) { Id = id });
                }
                RealtimeService
                    .GetRepository<Question>()
                    .Add(
                        new[]
                        {
                            new Question
                            {
                                Id = $"{projectId}:question{bookId}{c}",
                                DataId = $"question{bookId}{c}",
                                ProjectRef = projectId,
                                VerseRef = new VerseRefData(bookNum, c, 1)
                            }
                        }
                    );
            }
        }

        private void MockGetBookText(string paratextId, string bookId)
        {
            string oldBookText = GetBookText(paratextId, bookId, 1);
            string remoteBookText = GetBookText(paratextId, bookId, 3);
            ParatextService
                .GetBookText(Arg.Any<UserSecret>(), paratextId, Canon.BookIdToNumber(bookId))
                .Returns(x => _sendReceivedCalled ? remoteBookText : oldBookText);
        }

        private static string GetBookText(string paratextId, string bookId, int version) =>
            $"<usx version=\"2.5\"><book code=\"{bookId}\" style=\"id\">{paratextId}</book><content version=\"{version}\"/></usx>";

        private void SetupNoteThreadChanges(NoteThreadChange[] noteThreadChanges, string projectId, int bookNum)
        {
            ParatextService
                .GetNoteThreadChanges(
                    Arg.Any<UserSecret>(),
                    projectId,
                    bookNum,
                    Arg.Any<IEnumerable<IDocument<NoteThread>>>(),
                    Arg.Any<Dictionary<int, ChapterDelta>>(),
                    Arg.Any<Dictionary<string, ParatextUserProfile>>()
                )
                .Returns(noteThreadChanges);
        }

        private static Note CreateNote(
            string threadId,
            string noteId,
            string user,
            string content,
            ChangeType type,
            int? tagId = null,
            int? versionNumber = null
        )
        {
            return new Note
            {
                DataId = noteId,
                ThreadId = threadId,
                OwnerRef = "",
                SyncUserRef = user,
                Content = content,
                DateCreated = new DateTime(2019, 1, 1, 8, 0, 0, DateTimeKind.Utc),
                Deleted = type == ChangeType.Deleted,
                TagId = tagId,
                Assignment = CommentThread.teamUser,
                VersionNumber = versionNumber,
            };
        }

        private static Note CreateNoteSimple(string threadId, string noteId)
        {
            return new Note
            {
                DataId = noteId,
                ThreadId = threadId,
                OwnerRef = "",
                DateCreated = new DateTime(2019, 1, 1, 8, 0, 0, DateTimeKind.Utc),
            };
        }
    }
}
