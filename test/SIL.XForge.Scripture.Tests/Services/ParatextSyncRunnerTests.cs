using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.Extensions.Logging;
using NSubstitute;
using NUnit.Framework;
using Paratext.Data.ProjectComments;
using SIL.Machine.WebApi.Services;
using SIL.Scripture;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.RichText;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Realtime;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Services
{
    [TestFixture]
    public class ParatextSyncRunnerTests
    {
        [Test]
        public async Task SyncAsync_ProjectDoesNotExist()
        {
            var env = new TestEnvironment();

            // SUT
            await env.Runner.RunAsync("project03", "user01", false, CancellationToken.None);
        }

        [Test]
        public async Task SyncAsync_UserDoesNotExist()
        {
            var env = new TestEnvironment();
            env.SetupSFData(true, true, true, false);
            env.ParatextService.GetLatestSharedVersion(Arg.Any<UserSecret>(), "target").Returns("beforeSR");

            await env.Runner.RunAsync("project01", "user03", false, CancellationToken.None);

            SFProject project = env.VerifyProjectSync(false);
            Assert.That(project.Sync.DataInSync, Is.True);
        }

        [Test]
        public async Task SyncAsync_Error()
        {
            var env = new TestEnvironment();
            env.SetupSFData(true, true, false, false);
            env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2));
            env.DeltaUsxMapper.When(d => d.ToChapterDeltas(Arg.Any<XDocument>())).Do(x => throw new Exception());

            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);

            SFProject project = env.VerifyProjectSync(false);
            Assert.That(project.Sync.DataInSync, Is.False);
        }

        [Test]
        public async Task SyncAsync_NewProjectTranslationSuggestionsAndCheckingDisabled()
        {
            var env = new TestEnvironment();
            env.SetupSFData(false, false, false, false);
            env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2, false));

            await env.Runner.RunAsync("project01", "user01", true, CancellationToken.None);

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

            await env.EngineService.DidNotReceive().StartBuildByProjectIdAsync("project01");
            env.VerifyProjectSync(true);
        }

        [Test]
        public async Task SyncAsync_NewProjectTranslationSuggestionsAndCheckingEnabled()
        {
            var env = new TestEnvironment();
            env.SetupSFData(true, true, false, false);
            env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2, false));

            await env.Runner.RunAsync("project02", "user01", true, CancellationToken.None);
            await env.Runner.RunAsync("project01", "user01", true, CancellationToken.None);

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

            await env.EngineService.Received().StartBuildByProjectIdAsync("project01");
            env.VerifyProjectSync(true);
        }

        [Test]
        public async Task SyncAsync_NewProjectOnlyTranslationSuggestionsEnabled()
        {
            var env = new TestEnvironment();
            env.SetupSFData(true, false, false, false);
            env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2, false));

            await env.Runner.RunAsync("project02", "user01", true, CancellationToken.None);
            await env.Runner.RunAsync("project01", "user01", true, CancellationToken.None);

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

            await env.EngineService.Received().StartBuildByProjectIdAsync("project01");
            env.VerifyProjectSync(true);
        }

        [Test]
        public async Task SyncAsync_NewProjectOnlyCheckingEnabled()
        {
            var env = new TestEnvironment();
            env.SetupSFData(false, true, false, false);
            env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2, false));

            await env.Runner.RunAsync("project01", "user01", true, CancellationToken.None);

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

            await env.EngineService.DidNotReceive().StartBuildByProjectIdAsync("project01");
            env.VerifyProjectSync(true);
        }

        [Test]
        public async Task SyncAsync_DataNotChanged()
        {
            var env = new TestEnvironment();
            Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
            env.SetupSFData(true, true, false, false, books);
            env.SetupPTData(books);

            // SUT
            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);

            env.MockLogger.AssertEventCount((LogEvent logEvent) => logEvent.LogLevel == LogLevel.Information &&
                Regex.IsMatch(logEvent.Message, "Starting"), 1);

            await env.ParatextService.DidNotReceive().PutBookText(Arg.Any<UserSecret>(), "target", 40, Arg.Any<string>());
            await env.ParatextService.DidNotReceive().PutBookText(Arg.Any<UserSecret>(), "target", 41, Arg.Any<string>());

            await env.ParatextService.DidNotReceive().PutBookText(Arg.Any<UserSecret>(), "source", 40, Arg.Any<string>());
            await env.ParatextService.DidNotReceive().PutBookText(Arg.Any<UserSecret>(), "source", 41, Arg.Any<string>());

            var delta = Delta.New().InsertText("text");
            Assert.That(env.GetText("project01", "MAT", 1).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("project01", "MAT", 2).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("project01", "MRK", 1).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("project01", "MRK", 2).DeepEquals(delta), Is.True);

            Assert.That(env.GetText("project02", "MAT", 1).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("project02", "MAT", 2).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("project02", "MRK", 1).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("project02", "MRK", 2).DeepEquals(delta), Is.True);

            env.ParatextService.DidNotReceive().PutNotes(Arg.Any<UserSecret>(), "target", Arg.Any<string>());

            SFProjectSecret projectSecret = env.GetProjectSecret();
            Assert.That(projectSecret.SyncUsers.Count, Is.EqualTo(2));

            SFProject project = env.VerifyProjectSync(true);
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

            await env.Runner.RunAsync("project02", "user01", false, CancellationToken.None);
            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);

            await env.ParatextService.Received()
                .PutBookText(Arg.Any<UserSecret>(), "target", 40, Arg.Any<string>(), Arg.Any<Dictionary<int, string>>());
            await env.ParatextService.Received()
                .PutBookText(Arg.Any<UserSecret>(), "target", 41, Arg.Any<string>(), Arg.Any<Dictionary<int, string>>());

            await env.ParatextService.Received()
                .PutBookText(Arg.Any<UserSecret>(), "source", 40, Arg.Any<string>(), Arg.Any<Dictionary<int, string>>());
            await env.ParatextService.Received()
                .PutBookText(Arg.Any<UserSecret>(), "source", 41, Arg.Any<string>(), Arg.Any<Dictionary<int, string>>());

            var delta = Delta.New().InsertText("text");
            Assert.That(env.GetText("project01", "MAT", 1).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("project01", "MAT", 2).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("project01", "MRK", 1).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("project01", "MRK", 2).DeepEquals(delta), Is.True);

            Assert.That(env.GetText("project02", "MAT", 1).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("project02", "MAT", 2).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("project02", "MRK", 1).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("project02", "MRK", 2).DeepEquals(delta), Is.True);

            env.ParatextService.Received(2).PutNotes(Arg.Any<UserSecret>(), "target", Arg.Any<string>());

            SFProjectSecret projectSecret = env.GetProjectSecret();
            Assert.That(projectSecret.SyncUsers.Count, Is.EqualTo(2));
            env.VerifyProjectSync(true);
        }

        [Test]
        public async Task SyncAsync_DataChangedTranslateEnabledCheckingDisabled()
        {
            var env = new TestEnvironment();
            Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
            env.SetupSFData(true, false, true, false, books);
            env.SetupPTData(books);

            await env.Runner.RunAsync("project02", "user01", false, CancellationToken.None);
            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);

            await env.ParatextService.Received()
                .PutBookText(Arg.Any<UserSecret>(), "target", 40, Arg.Any<string>(), Arg.Any<Dictionary<int, string>>());
            await env.ParatextService.Received()
                .PutBookText(Arg.Any<UserSecret>(), "target", 41, Arg.Any<string>(), Arg.Any<Dictionary<int, string>>());

            await env.ParatextService.Received()
                .PutBookText(Arg.Any<UserSecret>(), "source", 40, Arg.Any<string>(), Arg.Any<Dictionary<int, string>>());
            await env.ParatextService.Received()
                .PutBookText(Arg.Any<UserSecret>(), "source", 41, Arg.Any<string>(), Arg.Any<Dictionary<int, string>>());

            env.ParatextService.DidNotReceive().PutNotes(Arg.Any<UserSecret>(), "target", Arg.Any<string>());

            var delta = Delta.New().InsertText("text");
            Assert.That(env.GetText("project01", "MAT", 1).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("project01", "MAT", 2).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("project01", "MRK", 1).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("project01", "MRK", 2).DeepEquals(delta), Is.True);

            Assert.That(env.GetText("project02", "MAT", 1).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("project02", "MAT", 2).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("project02", "MRK", 1).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("project02", "MRK", 2).DeepEquals(delta), Is.True);

            SFProjectSecret projectSecret = env.GetProjectSecret();
            Assert.That(projectSecret.SyncUsers.Count, Is.EqualTo(2));
            env.VerifyProjectSync(true);
        }

        [Test]
        public async Task SyncAsync_ChaptersChanged()
        {
            var env = new TestEnvironment();
            env.SetupSFData(true, true, false, false, new Book("MAT", 2), new Book("MRK", 2));
            env.SetupPTData(new Book("MAT", 3), new Book("MRK", 1));
            env.AddParatextNoteThreadData(new Book("MRK", 2));
            Assert.That(env.ContainsNote(2), Is.True);

            await env.Runner.RunAsync("project02", "user01", false, CancellationToken.None);
            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);
            env.ParatextService.Received().GetNoteThreadChanges(Arg.Any<UserSecret>(), "target", 41,
                Arg.Is<IEnumerable<IDocument<NoteThread>>>(threads => threads.Any(t => t.Id == "project01:thread02")),
                Arg.Any<Dictionary<int, ChapterDelta>>(),
                Arg.Any<Dictionary<string, SyncUser>>());

            Assert.That(env.ContainsText("project01", "MAT", 3), Is.True);
            Assert.That(env.ContainsText("project01", "MRK", 2), Is.False);

            Assert.That(env.ContainsText("project02", "MAT", 3), Is.True);
            Assert.That(env.ContainsText("project02", "MRK", 2), Is.False);

            Assert.That(env.ContainsQuestion("MAT", 2), Is.True);
            Assert.That(env.ContainsQuestion("MRK", 2), Is.False);
            Assert.That(env.ContainsNote(2), Is.True);
            env.VerifyProjectSync(true);
        }

        [Test]
        public async Task SyncAsync_ChapterValidityChanged()
        {
            var env = new TestEnvironment();
            env.SetupSFData(true, true, false, false, new Book("MAT", 2), new Book("MRK", 2) { InvalidChapters = { 1 } });
            env.SetupPTData(new Book("MAT", 2) { InvalidChapters = { 2 } }, new Book("MRK", 2));

            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);

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
            env.AddParatextNoteThreadData(new Book("MRK", 2));

            Assert.That(env.ContainsNote(2), Is.True);
            await env.Runner.RunAsync("project02", "user01", false, CancellationToken.None);
            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);

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
        }

        [Test]
        public async Task SyncAsync_UserRoleChangedAndUserRemoved()
        {
            var env = new TestEnvironment();
            Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
            env.SetupSFData(true, true, false, false, books);
            env.SetupPTData(books);
            var ptUserRoles = new Dictionary<string, string>
            {
                { "pt01", SFProjectRole.Translator }
            };
            env.ParatextService.GetProjectRolesAsync(Arg.Any<UserSecret>(),
                Arg.Is((SFProject project) => project.ParatextId == "target"), Arg.Any<CancellationToken>())
                .Returns(Task.FromResult<IReadOnlyDictionary<string, string>>(ptUserRoles));

            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);

            SFProject project = env.VerifyProjectSync(true);
            Assert.That(project.UserRoles["user01"], Is.EqualTo(SFProjectRole.Translator));
            await env.SFProjectService.Received().RemoveUserAsync("user01", "project01", "user02");
        }

        [Test]
        public async Task SyncAsync_SetsUserPermissions()
        {
            var env = new TestEnvironment();
            Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
            env.SetupSFData(true, true, false, false, books);
            env.SetupPTData(books);
            var ptUserRoles = new Dictionary<string, string>
            {
                { "pt01", SFProjectRole.Translator }
            };
            env.ParatextService.GetProjectRolesAsync(Arg.Any<UserSecret>(),
                Arg.Is((SFProject project) => project.ParatextId == "target"), Arg.Any<CancellationToken>())
                .Returns(Task.FromResult<IReadOnlyDictionary<string, string>>(ptUserRoles));

            // SUT
            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);

            await env.SFProjectService.Received().UpdatePermissionsAsync("user01",
                Arg.Is<IDocument<SFProject>>((IDocument<SFProject> sfProjDoc) =>
                    sfProjDoc.Data.Id == "project01" && sfProjDoc.Data.ParatextId == "target"),
                Arg.Any<CancellationToken>());
        }

        [Test]
        public async Task SyncAsync_CheckerWithPTAccountNotRemoved()
        {
            var env = new TestEnvironment();
            Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
            env.SetupSFData(true, true, false, false, books);
            env.SetupPTData(books);
            var ptUserRoles = new Dictionary<string, string>
            {
                { "pt01", SFProjectRole.Administrator }
            };
            env.ParatextService.GetProjectRolesAsync(Arg.Any<UserSecret>(),
                Arg.Is((SFProject project) => project.ParatextId == "target"), Arg.Any<CancellationToken>())
                .Returns(Task.FromResult<IReadOnlyDictionary<string, string>>(ptUserRoles));

            await env.SetUserRole("user02", SFProjectRole.CommunityChecker);
            SFProject project = env.GetProject();
            Assert.That(project.UserRoles["user02"], Is.EqualTo(SFProjectRole.CommunityChecker));
            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);

            env.VerifyProjectSync(true);
            await env.SFProjectService.DidNotReceiveWithAnyArgs().RemoveUserAsync("user01", "project01", "user02");
        }

        [Test]
        public async Task SyncAsync_LanguageIsRightToLeft_ProjectPropertySet()
        {
            var env = new TestEnvironment();
            Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
            env.SetupSFData(true, false, false, false, books);
            env.SetupPTData(books);

            env.ParatextService.IsProjectLanguageRightToLeft(Arg.Any<UserSecret>(), "target")
                .Returns(true);
            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);

            SFProject project = env.GetProject();
            env.ParatextService.Received().IsProjectLanguageRightToLeft(Arg.Any<UserSecret>(), "target");
            env.ParatextService.Received().IsProjectLanguageRightToLeft(Arg.Any<UserSecret>(), "source");
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

            env.ParatextService.GetProjectFullName(Arg.Any<UserSecret>(), "target")
                .Returns((string)null);

            // SUT
            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);

            SFProject project = env.GetProject();
            env.ParatextService.Received().GetProjectFullName(Arg.Any<UserSecret>(), "target");
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
            env.ParatextService.GetProjectFullName(Arg.Any<UserSecret>(), "target")
                .Returns(newFullName);

            // SUT
            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);

            SFProject project = env.GetProject();
            env.ParatextService.Received().GetProjectFullName(Arg.Any<UserSecret>(), "target");
            Assert.That(project.Name, Is.EqualTo(newFullName));
        }

        [Test]
        public async Task SyncAsync_TextDocAlreadyExists()
        {
            var env = new TestEnvironment();
            env.SetupSFData(false, false, false, false, new Book("MAT", 2), new Book("MRK", 2));
            env.RealtimeService.GetRepository<TextData>()
                .Add(new TextData(Delta.New().InsertText("old text"))
                {
                    Id = TextData.GetTextDocId("project01", 42, 1)
                });
            env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2), new Book("LUK", 2));

            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);

            var delta = Delta.New().InsertText("text");
            Assert.That(env.GetText("project01", "MAT", 1).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("project01", "MAT", 2).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("project01", "MRK", 1).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("project01", "MRK", 2).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("project01", "LUK", 1).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("project01", "LUK", 2).DeepEquals(delta), Is.True);
            env.VerifyProjectSync(true);
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
            await env.Runner.RunAsync("project02", "user01", false, CancellationToken.None);
            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);

            // No errors or exceptions were logged
            env.MockLogger.AssertNoEvent((LogEvent logEvent) => logEvent.LogLevel == LogLevel.Error || logEvent.Exception != null);

            var chapterContent = Delta.New().InsertText("text");
            // DB should contain Source chapter 2 now from Paratext.
            Assert.That(env.ContainsText("project01", "MAT", 2), Is.True);
            Assert.That(env.ContainsText("project02", "MAT", 2), Is.True);
            Assert.That(env.GetText("project01", "MAT", 2).DeepEquals(chapterContent), Is.True);
            Assert.That(env.GetText("project02", "MAT", 2).DeepEquals(chapterContent), Is.True);
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
            await env.Runner.RunAsync("project02", "user01", false, CancellationToken.None);
            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);

            // No errors or exceptions were logged
            env.MockLogger.AssertNoEvent((LogEvent logEvent) => logEvent.LogLevel == LogLevel.Error || logEvent.Exception != null);

            // DB should now be missing chapter 2, but retain chapters 1 and 3.
            Assert.That(env.ContainsText("project01", "MAT", 1), Is.True);
            Assert.That(env.ContainsText("project02", "MAT", 1), Is.True);
            Assert.That(env.ContainsText("project01", "MAT", 2), Is.False);
            Assert.That(env.ContainsText("project02", "MAT", 2), Is.False);
            Assert.That(env.ContainsText("project01", "MAT", 3), Is.True);
            Assert.That(env.ContainsText("project02", "MAT", 3), Is.True);
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
            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);

            // No errors or exceptions were logged
            env.MockLogger.AssertNoEvent((LogEvent logEvent) => logEvent.LogLevel == LogLevel.Error || logEvent.Exception != null);

            // DB should still be missing Source chapter 2.
            Assert.That(env.ContainsText("project01", "MAT", 2), Is.True);
            Assert.That(env.ContainsText("project02", "MAT", 2), Is.False);
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
            await env.Runner.RunAsync("project02", "user01", false, CancellationToken.None);
            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);

            // No errors or exceptions were logged
            env.MockLogger.AssertNoEvent((LogEvent logEvent) => logEvent.LogLevel == LogLevel.Error || logEvent.Exception != null);

            // DB should now be missing all chapters except for the first, implicit chapter.
            Assert.That(env.ContainsText("project01", "MAT", 1), Is.True);
            Assert.That(env.ContainsText("project02", "MAT", 1), Is.True);
            Assert.That(env.ContainsText("project01", "MAT", 2), Is.False);
            Assert.That(env.ContainsText("project02", "MAT", 2), Is.False);
            Assert.That(env.ContainsText("project01", "MAT", 3), Is.False);
            Assert.That(env.ContainsText("project02", "MAT", 3), Is.False);
        }

        [Test]
        public async Task RunAsync_NoRecordOfSyncedToRepositoryVersion_DoesFullSync()
        {
            foreach (bool isChanged in new bool[] { true, false })
            {
                var env = new TestEnvironment();
                string projectSFId = "project03";
                string userId = "user01";

                Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
                bool translationSuggestionsEnabled = true;
                bool checkingEnabled = true;
                bool changed = isChanged;
                bool hasNoteThreads = false;
                env.SetupSFData(projectSFId, "project04", translationSuggestionsEnabled, checkingEnabled, changed,
                    hasNoteThreads, books);
                SFProject project = env.GetProject(projectSFId);
                string projectPTId = project.ParatextId;
                env.SetupPTDataForProjectIds(projectPTId, env.GetProject("project04").ParatextId, books);
                Assert.That(project.Sync.SyncedToRepositoryVersion, Is.Null,
                    "setup. Should be testing what happens when this is not set.");
                Assert.That(project.Sync.DataInSync, Is.Null,
                    "setup. Should be testing what happens when this is not set.");
                env.ParatextService.GetLatestSharedVersion(Arg.Any<UserSecret>(), projectPTId)
                    .Returns("1", "2");

                // SUT
                await env.Runner.RunAsync(projectSFId, userId, false, CancellationToken.None);

                project = env.GetProject(projectSFId);
                // We should get into UpdateParatextBook() and fetch and perhaps put books.
                env.ParatextService.Received().GetBookText(Arg.Any<UserSecret>(), projectPTId, Arg.Any<int>());
                env.DeltaUsxMapper.Received().ToUsx(Arg.Any<XDocument>(), Arg.Any<IEnumerable<ChapterDelta>>());
                // We should get into UpdateParatextNotesAsync() and fetch and perhaps put notes.
                env.ParatextService.Received().GetNotes(Arg.Any<UserSecret>(), projectPTId, Arg.Any<int>());
                await env.NotesMapper.Received().GetNotesChangelistAsync(Arg.Any<XElement>(),
                    Arg.Any<IEnumerable<IDocument<Question>>>(), Arg.Any<Dictionary<string, SyncUser>>());
                // We should have then called SR
                await env.ParatextService.Received(1).SendReceiveAsync(Arg.Any<UserSecret>(), projectPTId,
                    Arg.Any<IProgress<ProgressState>>());

                // The expected repository version can still be past the original project version, even if there were
                // no local changes, since there may be incoming changes.
                string expectedRepositoryVersion = "2";
                env.VerifyProjectSync(true, expectedRepositoryVersion, projectSFId);
            }
        }

        [Test]
        public async Task RunAsync_NoRecordOfSyncedToRepositoryVersionYetOutOfSyncRecord_NotWriteToPT()
        {
            foreach (bool isChanged in new bool[] { true, false })
            {
                var env = new TestEnvironment();
                string projectSFId = "project05";
                string userId = "user01";

                Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
                bool translationSuggestionsEnabled = false;
                bool checkingEnabled = true;
                bool changed = isChanged;
                bool hasNoteThreads = false;
                env.SetupSFData(projectSFId, "project04", translationSuggestionsEnabled, checkingEnabled, changed,
                    hasNoteThreads, books);
                SFProject project = env.GetProject(projectSFId);
                string projectPTId = project.ParatextId;
                // env.SetupPTData(projectPTId, env.GetProject("project04").ParatextId, books);
                Assert.That(project.Sync.SyncedToRepositoryVersion, Is.Null,
                    "setup. Should be testing what happens when this is not set.");
                Assert.That(project.Sync.DataInSync, Is.False,
                    "setup. Should be testing what happens for this.");
                env.ParatextService.GetLatestSharedVersion(Arg.Any<UserSecret>(), projectPTId)
                    .Returns("1", "2");

                // SUT
                await env.Runner.RunAsync(projectSFId, userId, false, CancellationToken.None);

                project = env.GetProject(projectSFId);
                // We are in an out-of-sync situation and so should not be writing to PT.

                env.ParatextService.DidNotReceiveWithAnyArgs().GetBookText(default, default, default);
                env.DeltaUsxMapper.DidNotReceiveWithAnyArgs().ToUsx(Arg.Any<XDocument>(),
                    Arg.Any<IEnumerable<ChapterDelta>>());
                env.ParatextService.DidNotReceiveWithAnyArgs().GetNotes(default, default, default);
                await env.NotesMapper.DidNotReceiveWithAnyArgs().GetNotesChangelistAsync(Arg.Any<XElement>(),
                    Arg.Any<IEnumerable<IDocument<Question>>>(), Arg.Any<Dictionary<string, SyncUser>>());
                // We should have then called SR
                await env.ParatextService.Received(1).SendReceiveAsync(Arg.Any<UserSecret>(), projectPTId,
                    Arg.Any<IProgress<ProgressState>>());

                string expectedRepositoryVersion = "2";
                env.VerifyProjectSync(true, expectedRepositoryVersion, projectSFId);
            }
        }

        [Test]
        public async Task SyncAsync_TaskAbortedByExceptionWritesToLog()
        {
            // Set up the environment
            var env = new TestEnvironment();
            env.SetupSFData(true, true, false, false);
            env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2));
            var cancellationTokenSource = new CancellationTokenSource();

            // Setup a trap to crash the task
            env.NotesMapper.When(x => x.InitAsync(Arg.Any<UserSecret>(), Arg.Any<SFProjectSecret>(),
                Arg.Any<List<User>>(), Arg.Any<SFProject>(), Arg.Any<CancellationToken>()))
                .Do(_ => throw new ArgumentException());

            // Run the task
            await env.Runner.RunAsync("project01", "user01", false, cancellationTokenSource.Token);

            // Check that the Exception was logged
            env.MockLogger.AssertHasEvent((LogEvent logEvent) => logEvent.Exception != null);

            // Check that the task cancelled correctly
            SFProject project = env.VerifyProjectSync(false);
            Assert.That(project.Sync.DataInSync, Is.True);  // Nothing was synced as this was cancelled OnInit()
        }

        [Test]
        public async Task SyncAsync_BackupRestoredPreviouslyRevNotMatching_WritesToPT()
        {
            var env = new TestEnvironment();
            env.SetupSFData(true, true, true, false, new Book("MAT", 2), new Book("MRK", 2));
            env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2));

            // Setup to simulate that a backup was restored at a revision not matching the recorded
            // version in the project doc
            env.ParatextService.BackupExists(Arg.Any<UserSecret>(), Arg.Any<string>()).Returns(true);
            env.ParatextService.GetLatestSharedVersion(Arg.Any<UserSecret>(), "target")
                .Returns("revNotMatchingVersion");

            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);

            // Check that text edits were pushed even if the current hg repo was not at the version recorded in
            // the project docs.
            await env.ParatextService.Received(2).PutBookText(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<int>(),
                Arg.Any<string>(), Arg.Any<Dictionary<int, string>>());
            SFProject project = env.VerifyProjectSync(true);
            Assert.That(project.Sync.DataInSync, Is.True);
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
                .Do(_ => env.ParatextService.GetLatestSharedVersion(Arg.Any<UserSecret>(), "target")
                    .Returns("revNotMatchingVersion"));

            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);

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
            var cancellationTokenSource = new CancellationTokenSource();

            // Setup a trap to cancel the task
            env.NotesMapper.When(x => x.InitAsync(Arg.Any<UserSecret>(), Arg.Any<SFProjectSecret>(),
                Arg.Any<List<User>>(), Arg.Any<SFProject>(), Arg.Any<CancellationToken>()))
                .Do(_ => throw new TaskCanceledException());

            // Run the task
            await env.Runner.RunAsync("project01", "user01", false, cancellationTokenSource.Token);

            // The TaskCancelledException was not logged
            Assert.That(env.MockLogger.LogEvents.Count((LogEvent logEvent) => logEvent.LogLevel == LogLevel.Error || logEvent.Exception != null), Is.EqualTo(0));


            // Check that the task cancelled correctly
            SFProject project = env.VerifyProjectSync(false);
            Assert.That(project.Sync.DataInSync, Is.True);  // Nothing was synced as this was cancelled OnInit()
        }

        [Test]
        public async Task SyncAsync_TaskCancelledMidway()
        {
            // Set up the environment
            var env = new TestEnvironment();
            env.SetupSFData(true, true, false, false);
            env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2));
            var cancellationTokenSource = new CancellationTokenSource();

            // Setup a trap to cancel the task
            env.ParatextService.When(x => x.SendReceiveAsync(Arg.Any<UserSecret>(), Arg.Any<string>(),
                Arg.Any<IProgress<ProgressState>>(), Arg.Any<CancellationToken>()))
                .Do(_ => cancellationTokenSource.Cancel());

            // Run the task
            await env.Runner.RunAsync("project01", "user01", false, cancellationTokenSource.Token);

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
            var cancellationTokenSource = new CancellationTokenSource();
            env.ParatextService.BackupExists(Arg.Any<UserSecret>(), Arg.Any<string>()).Returns(true);
            env.ParatextService.RestoreRepository(Arg.Any<UserSecret>(), Arg.Any<string>()).Returns(false);

            env.ParatextService.When(x => x.SendReceiveAsync(Arg.Any<UserSecret>(), Arg.Any<string>(),
                Arg.Any<IProgress<ProgressState>>(), Arg.Any<CancellationToken>()))
                .Do(_ => cancellationTokenSource.Cancel());
            await env.Runner.RunAsync("project01", "user01", false, cancellationTokenSource.Token);
            env.ParatextService.Received(1).RestoreRepository(Arg.Any<UserSecret>(), Arg.Any<string>());
            SFProject project = env.VerifyProjectSync(false);
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
            var cancellationTokenSource = new CancellationTokenSource();

            // Cancel the token before awaiting the task
            cancellationTokenSource.Cancel();

            // Run the task
            await env.Runner.RunAsync("project01", "user01", false, cancellationTokenSource.Token);

            // Check that the task was cancelled after awaiting the check above
            SFProject project = env.VerifyProjectSync(false);
            Assert.That(project.Sync.DataInSync, Is.True);
        }

        [Test]
        public async Task SyncAsync_ExcludesPropertiesFromTransactions()
        {
            // Set up the environment
            var env = new TestEnvironment(substituteRealtimeService: true);
            env.SetupSFData(true, true, false, false);
            env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2));
            var cancellationTokenSource = new CancellationTokenSource();

            // Throw an TaskCanceledException in InitAsync after the exclusions have been called
            env.Connection.FetchAsync<SFProject>("project01")
                .Returns(Task.FromException<IDocument<SFProject>>(new TaskCanceledException()));

            // Run the task
            await env.Runner.RunAsync("project01", "user01", false, cancellationTokenSource.Token);

            // Only check for ExcludePropertyFromTransaction being executed,
            // as the substitute RealtimeService will not update documents.
            env.Connection.Received(1).ExcludePropertyFromTransaction(Arg.Is<Expression<Func<SFProject, object>>>(
                ex => string.Join('.', new ObjectPath(ex).Items) == "Sync.PercentCompleted"));
            env.Connection.Received(1).ExcludePropertyFromTransaction(Arg.Is<Expression<Func<SFProject, object>>>(
                ex => string.Join('.', new ObjectPath(ex).Items) == "Sync.QueuedCount"));
            env.Connection.Received(1).ExcludePropertyFromTransaction(Arg.Is<Expression<Func<SFProject, object>>>(
                ex => string.Join('.', new ObjectPath(ex).Items) == "Sync.DataInSync"));
            env.Connection.Received(3).ExcludePropertyFromTransaction(Arg.Any<Expression<Func<SFProject, object>>>());
        }

        [Test]
        public async Task SyncAsync_TaskCancelledTooLate()
        {
            // Set up the environment
            var env = new TestEnvironment();
            env.SetupSFData(true, true, false, false);
            env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2));
            var cancellationTokenSource = new CancellationTokenSource();

            // Run the task
            await env.Runner.RunAsync("project01", "user01", false, cancellationTokenSource.Token);

            // Cancel the token after awaiting the task
            cancellationTokenSource.Cancel();

            // Check that the sync was successful
            SFProject project = env.VerifyProjectSync(true);
            Assert.That(project.Sync.DataInSync, Is.True);
        }

        [Test]
        public async Task FetchTextDocsAsync_FetchesExistingChapters()
        {
            var env = new TestEnvironment();
            var numberChapters = 3;
            var book = new Book("MAT", numberChapters, true);
            env.SetupSFData(true, true, false, false, book);

            // SUT
            await env.Runner.InitAsync("project01", "user01", CancellationToken.None);
            SortedList<int, IDocument<TextData>> targetFetch =
                await env.Runner.FetchTextDocsAsync(env.TextInfoFromBook(book));
            await env.Runner.InitAsync("project02", "user01", CancellationToken.None);
            SortedList<int, IDocument<TextData>> sourceFetch =
                await env.Runner.FetchTextDocsAsync(env.TextInfoFromBook(book));
            env.Runner.CloseConnection();

            // Fetched numberChapters chapters, none of which are missing their chapter content.
            Assert.That(targetFetch.Count, Is.EqualTo(numberChapters));
            Assert.That(sourceFetch.Count, Is.EqualTo(numberChapters));
            Assert.That(targetFetch.Count(doc => doc.Value.Data == null), Is.EqualTo(0));
            Assert.That(sourceFetch.Count(doc => doc.Value.Data == null), Is.EqualTo(0));
        }

        [Test]
        public async Task FetchTextDocsAsync_MissingRequestedChapters()
        {
            // In production, the expected chapters list, used to specify
            // what FetchTextDocsAsync() should fetch, comes from the
            // SF DB project doc texts.chapters array. This array
            // specifies what Target chapter text docs the SF DB should
            // ave. Re-using the Target chapter list when fetching Source
            // chapter text docs from the SF DB can lead to problems if
            // FetchTextDocsAsync() does not omit ones that aren't
            // actually in the DB.

            var env = new TestEnvironment();
            var highestChapter = 20;
            var missingSourceChapters = new HashSet<int>() { 2, 3, 10, 12 };
            var existingTargetChapters = Enumerable.Range(1, highestChapter);
            var existingSourceChapters = Enumerable.Range(1, highestChapter).Except(missingSourceChapters);
            Assert.That(existingSourceChapters.Count(),
                Is.EqualTo(highestChapter - missingSourceChapters.Count()), "setup");
            Assert.That(existingTargetChapters.Count(),
                Is.GreaterThan(existingSourceChapters.Count()), "setup");
            var book = new Book("MAT", highestChapter, true) { MissingSourceChapters = missingSourceChapters };
            env.SetupSFData(true, true, false, false, book);

            // SUT
            await env.Runner.InitAsync("project01", "user01", CancellationToken.None);
            var targetFetch = await env.Runner.FetchTextDocsAsync(env.TextInfoFromBook(book));

            await env.Runner.InitAsync("project02", "user01", CancellationToken.None);
            var sourceFetch = await env.Runner.FetchTextDocsAsync(env.TextInfoFromBook(book));

            env.Runner.CloseConnection();

            // Fetched only non-missing chapters. None have null Data.
            Assert.That(targetFetch.Keys.SequenceEqual(existingTargetChapters));
            Assert.That(sourceFetch.Keys.SequenceEqual(existingSourceChapters));
            Assert.That(targetFetch.Count(doc => doc.Value.Data == null), Is.EqualTo(0));
            Assert.That(sourceFetch.Count(doc => doc.Value.Data == null), Is.EqualTo(0));
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
            await env.Runner.InitAsync("project01", "user01", CancellationToken.None);
            var textDocs = await env.Runner.FetchTextDocsAsync(textInfo);
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
            await env.Runner.InitAsync("project01", "user01", CancellationToken.None);
            var textDocs = await env.Runner.FetchTextDocsAsync(textInfo);

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
            await env.Runner.InitAsync("project01", "user02", CancellationToken.None);
            var textDocs = await env.Runner.FetchTextDocsAsync(textInfo);

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
            await env.Runner.InitAsync("project01", "user02", CancellationToken.None);
            var textDocs = await env.Runner.FetchTextDocsAsync(textInfo);

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
            await env.Runner.InitAsync("project01", "user01", CancellationToken.None);
            var textDocs = await env.Runner.FetchTextDocsAsync(textInfo);
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
            await env.Runner.InitAsync("project01", "user01", CancellationToken.None);
            var textDocs = await env.Runner.FetchTextDocsAsync(textInfo);
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
            env.SetupNoteChanges("thread01", "MAT 1:1", false);
            await env.ParatextService.UpdateParatextCommentsAsync(Arg.Any<UserSecret>(), default, default,
                Arg.Any<IEnumerable<IDocument<NoteThread>>>(), Arg.Any<Dictionary<string, SyncUser>>());

            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);
            await env.ParatextService.Received(1).UpdateParatextCommentsAsync(Arg.Any<UserSecret>(), "target", 40,
                Arg.Is<IEnumerable<IDocument<NoteThread>>>(t =>
                    t.Count() == 1 && t.First().Id == "project01:thread01"),
                Arg.Any<Dictionary<string, SyncUser>>()
            );

            SFProjectSecret projectSecret = env.GetProjectSecret();
            Assert.That(projectSecret.SyncUsers.Select(u => u.ParatextUsername), Is.EquivalentTo(
                new[] { "User 1", "User 2" }));
        }

        [Test]
        public async Task SyncAsync_UpdatesParatextNoteThreadDoc()
        {
            var env = new TestEnvironment();
            var book = new Book("MAT", 1, true);
            env.SetupSFData(true, false, false, true, book);
            env.SetupPTData(book);
            env.SetupNoteChanges("thread01");

            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);

            NoteThread thread01 = env.GetNoteThread("project01", "thread01");
            string expectedThreadTagIcon = "tag02";
            string expectedNoteTagIcon = "tag03";
            string threadExpected =
                "Context before Scripture text in project context after-Start:0-Length:0-MAT 1:1-" + expectedThreadTagIcon;
            Assert.That(thread01.NoteThreadToString(), Is.EqualTo(threadExpected));
            Assert.That(thread01.TagIcon, Is.EqualTo(expectedThreadTagIcon));
            env.DeltaUsxMapper.ReceivedWithAnyArgs(2).ToChapterDeltas(default);
            Assert.That(thread01.Notes.Count, Is.EqualTo(3));
            Assert.That(thread01.Notes[0].Content, Is.EqualTo("thread01 added."));
            string expected = "thread01-syncuser03--thread01 added.-" + expectedNoteTagIcon;
            Assert.That(thread01.Notes[0].NoteToString(), Is.EqualTo(expected));
            Assert.That(thread01.Notes[0].TagIcon, Is.EqualTo(expectedNoteTagIcon));
            Assert.That(thread01.Notes[0].OwnerRef, Is.EqualTo("user03"));
            Assert.That(thread01.Notes[1].Content, Is.EqualTo("thread01 updated."));
            Assert.That(thread01.Notes[2].Deleted, Is.True);

            SFProjectSecret projectSecret = env.GetProjectSecret();
            // User 3 was added as a sync user
            Assert.That(projectSecret.SyncUsers.Select(u => u.ParatextUsername), Is.EquivalentTo(
                new[] { "User 1", "User 2", "User 3" }));

            SFProject project = env.GetProject();
            Assert.That(project.Sync.QueuedCount, Is.EqualTo(0));
            Assert.That(project.Sync.LastSyncSuccessful, Is.True);
        }

        [Test]
        public async Task SyncAsync_AddParatextNoteThreadDoc()
        {
            var env = new TestEnvironment();
            var book = new Book("MAT", 3, true);
            env.SetupSFData(true, false, false, true, book);
            env.SetupPTData(book);
            env.SetupNewNoteThreadChange("thread02", "syncuser01");

            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);

            NoteThread thread02 = env.GetNoteThread("project01", "thread02");
            string expected = "Context before Scripture text in project context after-" +
                "Start:0-Length:0-MAT 1:1-icon1";
            Assert.That(thread02.NoteThreadToString(), Is.EqualTo(expected));
            Assert.That(thread02.Notes.Count, Is.EqualTo(1));
            Assert.That(thread02.Notes[0].Content, Is.EqualTo("New thread02 added."));
            Assert.That(thread02.Notes[0].OwnerRef, Is.EqualTo("user01"));
            Assert.That(thread02.Status, Is.EqualTo(NoteStatus.Todo.InternalValue));
            SFProject project = env.GetProject();
            Assert.That(project.Sync.LastSyncSuccessful, Is.True);
        }

        [Test]
        public async Task SyncAsync_RemovesParatextNoteThreadDoc()
        {
            var env = new TestEnvironment();
            var book = new Book("MAT", 1, true);
            env.SetupSFData(true, false, false, true, book);
            env.SetupPTData(book);
            env.SetupNoteRemovedChange("thread01", "n02");
            NoteThread thread01 = env.GetNoteThread("project01", "thread01");
            Assert.That(thread01.Notes.Select(n => n.DataId), Is.EquivalentTo(new[] { "n01", "n02" }));

            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);

            thread01 = env.GetNoteThread("project01", "thread01");
            Assert.That(thread01.Notes.Select(n => n.DataId), Is.EquivalentTo(new[] { "n01" }));
            SFProject project = env.GetProject();
            Assert.That(project.Sync.LastSyncSuccessful, Is.True);

            // Remove the entire thread
            env.SetupNoteRemovedChange("thread01", null);
            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);

            Assert.That(env.ContainsNoteThread("project01", "thread01"), Is.False);
            project = env.GetProject();
            Assert.That(project.Sync.LastSyncSuccessful, Is.True);
        }

        [Test]
        public async Task SyncAsync_NoteThreadsGetResolved()
        {
            var env = new TestEnvironment();
            var book = new Book("MAT", 3, true);
            env.SetupSFData(true, false, false, true, book);
            env.SetupPTData(book);
            env.SetupNewNoteThreadChange("thread02", "syncuser01");

            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);

            // Default resolved status is false
            NoteThread thread02 = env.GetNoteThread("project01", "thread02");
            Assert.That(thread02.VerseRef.ToString(), Is.EqualTo("MAT 1:1"));
            Assert.That(thread02.Status, Is.EqualTo(NoteStatus.Todo.InternalValue));

            // Change resolve status to true
            env.SetupNoteStatusChange("thread02", NoteStatus.Deleted.InternalValue);
            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);

            thread02 = env.GetNoteThread("project01", "thread02");
            Assert.That(thread02.VerseRef.ToString(), Is.EqualTo("MAT 1:1"));
            Assert.That(thread02.Status, Is.EqualTo(NoteStatus.Deleted.InternalValue));

            // Change status back to false - happens if the note becomes unresolved again in Paratext
            env.SetupNoteStatusChange("thread02", NoteStatus.Todo.InternalValue);
            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);

            thread02 = env.GetNoteThread("project01", "thread02");
            Assert.That(thread02.VerseRef.ToString(), Is.EqualTo("MAT 1:1"));
            Assert.That(thread02.Status, Is.EqualTo(NoteStatus.Todo.InternalValue));
        }

        private class Book
        {
            public Book(string bookId, int highestChapter, bool hasSource = true)
                : this(bookId, highestChapter, hasSource ? highestChapter : 0)
            {
            }

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
            private readonly MemoryRepository<SFProjectSecret> _projectSecrets;
            private bool _sendReceivedCalled = false;

            /// <summary>
            /// Initializes a new instance of the <see cref="TestEnvironment" /> class.
            /// </summary>
            /// <param name="substituteRealtimeService">If set to <c>true</c> use a substitute realtime service rather
            /// than the <see cref="SFMemoryRealtimeService" />.</param>
            public TestEnvironment(bool substituteRealtimeService = false)
            {
                var userSecrets = new MemoryRepository<UserSecret>(new[]
                {
                    new UserSecret { Id = "user01" },
                    new UserSecret { Id = "user02" },
                });
                _projectSecrets = new MemoryRepository<SFProjectSecret>(new[]
                {
                    new SFProjectSecret
                    {
                        Id = "project01",
                        JobIds = new List<string>{ "test_jobid" },
                        SyncUsers = new List<SyncUser> {
                            new SyncUser { Id = "syncuser01", ParatextUsername = "User 1" },
                            new SyncUser { Id = "syncuser02", ParatextUsername = "User 2" }
                        }
                    },
                    new SFProjectSecret { Id = "project02" },
                    new SFProjectSecret { Id = "project03" },
                    new SFProjectSecret { Id = "project04" },
                    new SFProjectSecret { Id = "project05" },
                });
                SFProjectService = Substitute.For<ISFProjectService>();
                EngineService = Substitute.For<IEngineService>();
                ParatextService = Substitute.For<IParatextService>();

                var ptUserRoles = new Dictionary<string, string>
                {
                    { "pt01", SFProjectRole.Administrator },
                    { "pt02", SFProjectRole.Translator }
                };
                ParatextService.GetProjectRolesAsync(Arg.Any<UserSecret>(),
                    Arg.Is((SFProject project) => project.ParatextId == "target"), Arg.Any<CancellationToken>())
                    .Returns(Task.FromResult<IReadOnlyDictionary<string, string>>(ptUserRoles));
                ParatextService.When(x => x.SendReceiveAsync(Arg.Any<UserSecret>(), "target",
                    Arg.Any<IProgress<ProgressState>>(), Arg.Any<CancellationToken>()))
                    .Do(x =>
                        {
                            _sendReceivedCalled = true;
                            ParatextService.GetLatestSharedVersion(Arg.Any<UserSecret>(), Arg.Any<string>())
                                .Returns("afterSR");
                        }
                    );
                ParatextService.IsProjectLanguageRightToLeft(Arg.Any<UserSecret>(), Arg.Any<string>())
                    .Returns(false);
                ParatextService.GetNotes(Arg.Any<UserSecret>(), "target", Arg.Any<int>()).Returns("<notes/>");
                ParatextService.GetParatextUsername(Arg.Is<UserSecret>(u => u.Id == "user01")).Returns("User 1");
                ParatextService.GetLatestSharedVersion(Arg.Any<UserSecret>(), "target")
                    .Returns("beforeSR");
                ParatextService.GetLatestSharedVersion(Arg.Any<UserSecret>(), "source")
                    .Returns("beforeSR", "afterSR");
                RealtimeService = new SFMemoryRealtimeService();
                Connection = Substitute.For<IConnection>();
                SubstituteRealtimeService = Substitute.For<IRealtimeService>();
                SubstituteRealtimeService.ConnectAsync().Returns(Task.FromResult(Connection));
                DeltaUsxMapper = Substitute.For<IDeltaUsxMapper>();
                NotesMapper = Substitute.For<IParatextNotesMapper>();
                MockLogger = new MockLogger<ParatextSyncRunner>();

                Runner = new ParatextSyncRunner(userSecrets, _projectSecrets, SFProjectService, EngineService,
                    ParatextService, substituteRealtimeService ? SubstituteRealtimeService : RealtimeService,
                    DeltaUsxMapper, NotesMapper, MockLogger);
            }

            public ParatextSyncRunner Runner { get; }
            public ISFProjectService SFProjectService { get; }
            public IEngineService EngineService { get; }
            public IParatextNotesMapper NotesMapper { get; }
            public IParatextService ParatextService { get; }
            public SFMemoryRealtimeService RealtimeService { get; }
            public IRealtimeService SubstituteRealtimeService { get; }
            public IDeltaUsxMapper DeltaUsxMapper { get; }
            public MockLogger<ParatextSyncRunner> MockLogger { get; }

            /// <summary>
            /// Gets the connection to be used with <see cref="SubstituteRealtimeService"/>.
            /// </summary>
            public IConnection Connection { get; }

            public SFProject GetProject(string projectSFId = "project01")
            {
                return RealtimeService.GetRepository<SFProject>().Get(projectSFId);
            }

            public SFProjectSecret GetProjectSecret(string projectId = "project01")
            {
                return _projectSecrets.Get(projectId);
            }

            public bool ContainsText(string projectId, string bookId, int chapter)
            {
                return RealtimeService.GetRepository<TextData>()
                    .Contains(TextData.GetTextDocId(projectId, Canon.BookIdToNumber(bookId), chapter));
            }

            public TextData GetText(string projectId, string bookId, int chapter)
            {
                return RealtimeService.GetRepository<TextData>()
                    .Get(TextData.GetTextDocId(projectId, Canon.BookIdToNumber(bookId), chapter));
            }

            public bool ContainsQuestion(string bookId, int chapter)
            {
                return RealtimeService.GetRepository<Question>().Contains($"project01:question{bookId}{chapter}");
            }

            public bool ContainsNote(int chapter)
            {
                return RealtimeService.GetRepository<NoteThread>().Contains($"project01:thread0{chapter}");
            }

            public Question GetQuestion(string bookId, int chapter)
            {
                return RealtimeService.GetRepository<Question>().Get($"project01:question{bookId}{chapter}");
            }

            public bool ContainsNoteThread(string projectId, string threadId)
            {
                return RealtimeService.GetRepository<NoteThread>().Contains($"{projectId}:{threadId}");
            }

            public NoteThread GetNoteThread(string projectId, string threadId)
            {
                return RealtimeService.GetRepository<NoteThread>().Get($"{projectId}:{threadId}");
            }

            public SFProject VerifyProjectSync(bool successful, string expectedRepoVersion = null,
                string projectSFId = "project01")
            {
                SFProjectSecret projectSecret = GetProjectSecret(projectSFId);
                Assert.That(projectSecret.JobIds.Count, Is.EqualTo(0));
                SFProject project = GetProject(projectSFId);
                Assert.That(project.Sync.QueuedCount, Is.EqualTo(0));
                Assert.That(project.Sync.LastSyncSuccessful, Is.EqualTo(successful));
                string repoVersion = expectedRepoVersion ?? (successful ? "afterSR" : "beforeSR");
                Assert.That(project.Sync.SyncedToRepositoryVersion, Is.EqualTo(repoVersion));
                return project;
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
                        new Chapter
                        {
                            Number = chapterNum,
                            Permissions = chapterPermissions,
                        },
                    },
                };
                RealtimeService.AddRepository("users", OTType.Json0, new MemoryRepository<User>(new[]
                {
                    new User
                    {
                        Id = "user01"
                    },
                }));
                RealtimeService.AddRepository("texts", OTType.RichText, new MemoryRepository<TextData>(new[]
                {
                    new TextData(Delta.New()) { Id = id },
                }));
                RealtimeService.AddRepository("sf_projects", OTType.Json0, new MemoryRepository<SFProject>(new[]
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
                }));
                return textInfo;
            }

            public void SetupSFData(bool translationSuggestionsEnabled, bool checkingEnabled, bool changed,
                bool noteOnFirstBook, params Book[] books)
            {
                SetupSFData("project01", "project02", translationSuggestionsEnabled, checkingEnabled, changed,
                    noteOnFirstBook, books);
            }

            public void SetupSFData(string targetProjectSFId, string sourceProjectSFId,
                bool translationSuggestionsEnabled, bool checkingEnabled, bool changed, bool noteOnFirstBook,
                params Book[] books)
            {
                RealtimeService.AddRepository("users", OTType.Json0, new MemoryRepository<User>(new[]
                {
                    new User
                    {
                        Id = "user01",
                        ParatextId = "pt01"
                    },
                    new User
                    {
                        Id = "user02",
                        ParatextId = "pt02"
                    }
                }));
                RealtimeService.AddRepository("sf_projects", OTType.Json0, new MemoryRepository<SFProject>(
                    new[]
                    {
                        new SFProject
                        {
                            Id = "project01",
                            Name = "project01",
                            ShortName = "P01",
                            UserRoles = new Dictionary<string, string>
                            {
                                { "user01", SFProjectRole.Administrator },
                                { "user02", SFProjectRole.Translator }
                            },
                            ParatextId = "target",
                            IsRightToLeft = false,
                            TranslateConfig = new TranslateConfig
                            {
                                TranslationSuggestionsEnabled = translationSuggestionsEnabled,
                                Source = new TranslateSource
                                {
                                    ParatextId = "source",
                                    ProjectRef = "project02",
                                    Name = "Source",
                                    ShortName = "SRC",
                                    WritingSystem = new WritingSystem
                                    {
                                        Tag = "en"
                                    },
                                    IsRightToLeft = false
                                }
                            },
                            CheckingConfig = new CheckingConfig
                            {
                                CheckingEnabled = checkingEnabled
                            },
                            Texts = books.Select(b => TextInfoFromBook(b)).ToList(),
                            Sync = new Sync
                            {
                                // QueuedCount is incremented before RunAsync() by SyncService.SyncAsync(). So set
                                // it to 1 to simulate it being incremented.
                                QueuedCount = 1,
                                SyncedToRepositoryVersion = "beforeSR",
                                DataInSync = true
                            }
                        },
                        new SFProject
                        {
                            Id = "project02",
                            Name = "Source",
                            ShortName = "SRC",
                            UserRoles = new Dictionary<string, string>(),
                            ParatextId = "source",
                            IsRightToLeft = false,
                            TranslateConfig = new TranslateConfig
                            {
                                TranslationSuggestionsEnabled = false
                            },
                            CheckingConfig = new CheckingConfig
                            {
                                CheckingEnabled = checkingEnabled
                            },
                            WritingSystem = new WritingSystem
                            {
                                Tag = "en"
                            },
                            Texts = books.Select(b => TextInfoFromBook(b)).ToList(),
                            Sync = new Sync
                            {
                                QueuedCount = 0,
                                SyncedToRepositoryVersion = "beforeSR"
                            }
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
                                    WritingSystem = new WritingSystem
                                    {
                                        Tag = "en"
                                    },
                                    IsRightToLeft = false
                                }
                            },
                            CheckingConfig = new CheckingConfig
                            {
                                CheckingEnabled = checkingEnabled
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
                            TranslateConfig = new TranslateConfig
                            {
                                TranslationSuggestionsEnabled = false
                            },
                            CheckingConfig = new CheckingConfig
                            {
                                CheckingEnabled = checkingEnabled
                            },
                            WritingSystem = new WritingSystem
                            {
                                Tag = "en"
                            },
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
                                    WritingSystem = new WritingSystem
                                    {
                                        Tag = "en"
                                    },
                                    IsRightToLeft = false
                                }
                            },
                            CheckingConfig = new CheckingConfig
                            {
                                CheckingEnabled = checkingEnabled
                            },
                            Texts = books.Select(b => TextInfoFromBook(b)).ToList(),
                            Sync = new Sync
                            {
                                QueuedCount = 1,
                                DataInSync = false
                                // No SyncedToRepositoryVersion
                            },
                        },
                    }));

                RealtimeService.AddRepository("texts", OTType.RichText, new MemoryRepository<TextData>());
                RealtimeService.AddRepository("questions", OTType.Json0, new MemoryRepository<Question>());
                if (noteOnFirstBook && books.Length > 0)
                    AddParatextNoteThreadData(books[0]);
                else
                    SetupEmptyNoteThreads();
                foreach (Book book in books)
                {
                    AddSFBook(targetProjectSFId, GetProject(targetProjectSFId).ParatextId, book.Id,
                        book.HighestTargetChapter, changed, book.MissingTargetChapters);
                    if (book.HighestSourceChapter > 0)
                    {
                        AddSFBook(sourceProjectSFId, GetProject(sourceProjectSFId).ParatextId, book.Id,
                            book.HighestSourceChapter, changed, book.MissingSourceChapters);
                    }
                }

                var notesElem = new XElement("notes");
                if (changed)
                {
                    notesElem.Add(new XElement("thread"));
                }

                NotesMapper.GetNotesChangelistAsync(Arg.Any<XElement>(),
                    Arg.Any<IEnumerable<IDocument<Question>>>(), Arg.Any<Dictionary<string, SyncUser>>()).Returns(Task.FromResult(notesElem));
            }

            public TextInfo TextInfoFromBook(Book book)
            {
                return new TextInfo
                {
                    BookNum = Canon.BookIdToNumber(book.Id),
                    Chapters = Enumerable.Range(1, book.HighestTargetChapter)
                        .Select(c => new Chapter
                        {
                            Number = c,
                            LastVerse = 10,
                            IsValid = !book.InvalidChapters.Contains(c),
                            Permissions = { }
                        }).ToList(),
                    HasSource = book.HighestSourceChapter > 0
                };
            }

            public void SetupPTData(params Book[] books)
            {
                SetupPTDataForProjectIds("target", "source", books);
            }

            public void SetupPTData(string targetProjectPTId, params Book[] books)
            {
                SetupPTDataForProjectIds(targetProjectPTId, "sourceProjectPTId", books);
            }

            public void SetupPTDataForProjectIds(string targetProjectPTId, string sourceProjectPTId, params Book[] books)
            {
                ParatextService.GetBookList(Arg.Any<UserSecret>(), targetProjectPTId)
                    .Returns(books.Select(b => Canon.BookIdToNumber(b.Id)).ToArray());
                // Include book with Source even if there are no chapters, if there are also no chapters in Target. PT
                // can actually have or not have books which do or do not have chapters more flexibly than this. But in
                // this way, allow tests to request a Source book exist even with zero chapters.
                ParatextService.GetBookList(Arg.Any<UserSecret>(), sourceProjectPTId)
                    .Returns(books
                        .Where(b => b.HighestSourceChapter > 0 || b.HighestSourceChapter == b.HighestTargetChapter)
                        .Select(b => Canon.BookIdToNumber(b.Id)).ToArray());
                foreach (Book book in books)
                {
                    AddPTBook(targetProjectPTId, book.Id, book.HighestTargetChapter, book.MissingTargetChapters,
                        book.InvalidChapters);
                    if (book.HighestSourceChapter > 0 || book.HighestSourceChapter == book.HighestTargetChapter)
                        AddPTBook(sourceProjectPTId, book.Id, book.HighestSourceChapter, book.MissingSourceChapters);
                }
            }

            public Task SetUserRole(string userId, string role)
            {
                return RealtimeService.GetRepository<SFProject>().UpdateAsync(p => p.Id == "project01", u =>
                    u.Set(pr => pr.UserRoles[userId], role));
            }

            public void SetupNoteChanges(string threadId, string verseRef = "MAT 1:1", bool fromParatext = true)
            {
                if (fromParatext)
                {
                    var noteThreadChange = new NoteThreadChange(threadId, verseRef, $"Scripture text in project",
                        "Context before ", " context after", NoteStatus.Todo.InternalValue, "tag02");
                    noteThreadChange.ThreadUpdated = true;
                    noteThreadChange.Position = new TextAnchor { Start = 0, Length = 0 };
                    noteThreadChange.AddChange(
                        GetNote(threadId, "n01", "syncuser01", $"{threadId} updated.", ChangeType.Updated), ChangeType.Updated);
                    noteThreadChange.AddChange(
                        GetNote(threadId, "n02", "syncuser02", $"{threadId} deleted.", ChangeType.Deleted), ChangeType.Deleted);
                    noteThreadChange.AddChange(
                        GetNote(threadId, "n03", "syncuser03", $"{threadId} added.", ChangeType.Added, "tag03"), ChangeType.Added);

                    ParatextService.GetNoteThreadChanges(Arg.Any<UserSecret>(), "target", 40,
                        Arg.Any<IEnumerable<IDocument<NoteThread>>>(),
                        Arg.Any<Dictionary<int, ChapterDelta>>(), Arg.Any<Dictionary<string, SyncUser>>())
                        .Returns(x =>
                        {
                            ((Dictionary<string, SyncUser>)x[5]).Add("User 3", new SyncUser
                            { Id = "syncuser03", ParatextUsername = "User 3" });
                            return new[] { noteThreadChange };
                        });
                    Dictionary<string, string> userIdsToUsernames = new Dictionary<string, string>
                    {
                        { "user01", "User 1" }, { "user02", "User 2" }, { "user03", "User 3" }
                    };
                    ParatextService.GetParatextUsernameMappingAsync(Arg.Any<UserSecret>(), Arg.Any<SFProject>(),
                        CancellationToken.None).Returns(userIdsToUsernames);
                }
                else
                {
                    var noteChange = new Paratext.Data.ProjectComments.Comment(new SFParatextUser("User 1"))
                    {
                        Thread = threadId,
                        VerseRefStr = verseRef
                    };
                    var changeList = (new[] { (new[] { noteChange }).ToList() }).ToList();
                }
            }

            public void SetupNoteStatusChange(string threadId, string status, string verseRef = "MAT 1:1")
            {
                var noteThreadChange = new NoteThreadChange(threadId, verseRef, $"{threadId} selected text.",
                    "Context before ", " context after", status, "icon1");
                noteThreadChange.ThreadUpdated = true;
                ParatextService.GetNoteThreadChanges(Arg.Any<UserSecret>(), "target", 40,
                    Arg.Any<IEnumerable<IDocument<NoteThread>>>(),
                    Arg.Any<Dictionary<int, ChapterDelta>>(), Arg.Any<Dictionary<string, SyncUser>>())
                    .Returns(new[] { noteThreadChange });
            }

            public void SetupNewNoteThreadChange(string threadId, string syncUserId, string verseRef = "MAT 1:1")
            {
                var noteThreadChange = new NoteThreadChange(threadId, verseRef, $"Scripture text in project",
                    "Context before ", " context after", NoteStatus.Todo.InternalValue, "icon1");
                noteThreadChange.Position = new TextAnchor { Start = 0, Length = 0 };
                noteThreadChange.AddChange(
                    GetNote(threadId, "n01", syncUserId, $"New {threadId} added.", ChangeType.Added), ChangeType.Added);
                ParatextService.GetNoteThreadChanges(Arg.Any<UserSecret>(), "target", 40,
                    Arg.Any<IEnumerable<IDocument<NoteThread>>>(),
                    Arg.Any<Dictionary<int, ChapterDelta>>(), Arg.Any<Dictionary<string, SyncUser>>())
                    .Returns(new[] { noteThreadChange });
            }

            public void SetupNoteRemovedChange(string threadId, string noteId, string verseRef = "MAT 1:1")
            {
                var noteThreadChange = new NoteThreadChange(threadId, verseRef, $"{threadId} selected text.",
                    "Context before ", " context after", NoteStatus.Deleted.InternalValue, "icon1");
                if (noteId == null)
                    noteThreadChange.ThreadRemoved = true;
                else
                    noteThreadChange.NoteIdsRemoved.Add(noteId);
                ParatextService.GetNoteThreadChanges(Arg.Any<UserSecret>(), "target", 40,
                    Arg.Any<IEnumerable<IDocument<NoteThread>>>(),
                    Arg.Any<Dictionary<int, ChapterDelta>>(), Arg.Any<Dictionary<string, SyncUser>>())
                    .Returns(new[] { noteThreadChange });
            }

            public void AddParatextNoteThreadData(Book book)
            {
                int chapter = book.HighestTargetChapter;
                string threadId = $"thread0{chapter}";
                RealtimeService.AddRepository("note_threads", OTType.Json0,
                    new MemoryRepository<NoteThread>(new[]
                    {
                        new NoteThread
                        {
                            Id = $"project01:{threadId}",
                            DataId = threadId,
                            ProjectRef = "project01",
                            OwnerRef = "user01",
                            VerseRef = new VerseRefData(Canon.BookIdToNumber(book.Id), chapter, 1),
                            OriginalContextBefore = "Context before ",
                            OriginalContextAfter = " context after",
                            OriginalSelectedText = "Scripture text in project",
                            TagIcon = "icon1",
                            Notes = new List<Note>()
                            {
                                new Note
                                {
                                    DataId = "n01",
                                    ThreadId = threadId,
                                    SyncUserRef = "syncuser01",
                                    ExtUserId = "user02",
                                    Content = "Paratext note 1.",
                                    DateCreated = new DateTime(2019, 1, 1, 8, 0, 0, DateTimeKind.Utc)
                                },
                                new Note
                                {
                                    DataId = "n02",
                                    ThreadId = threadId,
                                    SyncUserRef = "syncuser02",
                                    ExtUserId = "user03",
                                    Content = "Paratext note 2.",
                                    DateCreated = new DateTime(2019, 1, 1, 8, 0, 0, DateTimeKind.Utc)
                                },
                            }
                        }
                    })
                );
            }

            public void SetupEmptyNoteThreads()
            {
                RealtimeService.AddRepository("note_threads", OTType.Json0, new MemoryRepository<NoteThread>());
            }

            private void AddPTBook(string paratextId, string bookId, int highestChapter, HashSet<int> missingChapters,
                HashSet<int> invalidChapters = null)
            {
                MockGetBookText(paratextId, bookId);
                Func<XDocument, bool> predicate = d => (string)d?.Root?.Element("book")?.Attribute("code") == bookId
                        && (string)d?.Root?.Element("book") == paratextId;
                var chapterDeltas = Enumerable.Range(1, highestChapter)
                    .Where(chapterNumber => !(missingChapters?.Contains(chapterNumber) ?? false))
                    .Select(c => new ChapterDelta(c, 10, !(invalidChapters?.Contains(c) ?? false),
                        Delta.New().InsertText("text")));
                if (chapterDeltas.Count() == 0)
                {
                    // Add implicit ChapterDelta, mimicing DeltaUsxMapper.ToChapterDeltas().
                    chapterDeltas = chapterDeltas.Append(new ChapterDelta(1, 0, true, Delta.New()));
                }
                DeltaUsxMapper.ToChapterDeltas(Arg.Is<XDocument>(d => predicate(d))).Returns(chapterDeltas);
            }

            private void AddSFBook(string projectId, string paratextId, string bookId, int highestChapter, bool changed,
                HashSet<int> missingChapters = null)
            {
                MockGetBookText(paratextId, bookId);
                int bookNum = Canon.BookIdToNumber(bookId);
                string newBookText = GetBookText(paratextId, bookId, changed ? 2 : 1);
                Func<XDocument, bool> predicate = d => (string)d?.Root?.Element("book")?.Attribute("code") == bookId
                    && (string)d?.Root?.Element("book") == paratextId;
                DeltaUsxMapper.ToUsx(Arg.Is<XDocument>(d => predicate(d)), Arg.Any<IEnumerable<ChapterDelta>>())
                    .Returns(XDocument.Parse(newBookText));

                for (int c = 1; c <= highestChapter; c++)
                {
                    string id = TextData.GetTextDocId(projectId, bookNum, c);
                    if (!(missingChapters?.Contains(c) ?? false))
                    {
                        RealtimeService.GetRepository<TextData>()
                            .Add(new TextData(Delta.New().InsertText(changed ? "changed" : "text")) { Id = id });
                    }
                    RealtimeService.GetRepository<Question>().Add(new[]
                    {
                        new Question
                        {
                            Id = $"{projectId}:question{bookId}{c}",
                            DataId = $"question{bookId}{c}",
                            ProjectRef = projectId,
                            VerseRef = new VerseRefData(bookNum, c, 1)
                        }
                    });
                }
            }

            private void MockGetBookText(string paratextId, string bookId)
            {
                string oldBookText = GetBookText(paratextId, bookId, 1);
                string remoteBookText = GetBookText(paratextId, bookId, 3);
                ParatextService.GetBookText(Arg.Any<UserSecret>(), paratextId, Canon.BookIdToNumber(bookId))
                    .Returns(x => _sendReceivedCalled ? remoteBookText : oldBookText);
            }

            private static string GetBookText(string paratextId, string bookId, int version)
            {
                return $"<usx version=\"2.5\"><book code=\"{bookId}\" style=\"id\">{paratextId}</book><content version=\"{version}\"/></usx>";
            }

            private Note GetNote(string threadId, string noteId, string user, string content, ChangeType type, string tagIcon = null)
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
                    TagIcon = tagIcon ?? "icon1"
                };
            }
        }
    }
}
