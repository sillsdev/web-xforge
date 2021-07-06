using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.Extensions.Logging;
using NSubstitute;
using NUnit.Framework;
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

            await env.Runner.RunAsync("project03", "user01", false, CancellationToken.None);
        }

        [Test]
        public async Task SyncAsync_UserDoesNotExist()
        {
            var env = new TestEnvironment();
            env.SetupSFData(true, true, true);
            env.ParatextService.GetLatestSharedVersion(Arg.Any<UserSecret>(), "target").Returns("beforeSR");

            await env.Runner.RunAsync("project01", "user03", false, CancellationToken.None);

            SFProject project = env.VerifyProjectSync(false);
            Assert.That(project.Sync.DataInSync, Is.True);
        }

        [Test]
        public async Task SyncAsync_Error()
        {
            var env = new TestEnvironment();
            env.SetupSFData(true, true, false);
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
            env.SetupSFData(false, false, false);
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
            env.SetupSFData(true, true, false);
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
            env.SetupSFData(true, false, false);
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
            env.SetupSFData(false, true, false);
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
            env.SetupSFData(true, true, false, books);
            env.SetupPTData(books);

            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);

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
            Assert.That(projectSecret.SyncUsers.Count, Is.EqualTo(0));

            SFProject project = env.VerifyProjectSync(true);
            Assert.That(project.UserRoles["user01"], Is.EqualTo(SFProjectRole.Administrator));
            Assert.That(project.UserRoles["user02"], Is.EqualTo(SFProjectRole.Translator));
        }

        [Test]
        public async Task SyncAsync_DataChangedTranslateAndCheckingEnabled()
        {
            var env = new TestEnvironment();
            Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
            env.SetupSFData(true, true, true, books);
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
            Assert.That(projectSecret.SyncUsers.Count, Is.EqualTo(1));
            env.VerifyProjectSync(true);
        }

        [Test]
        public async Task SyncAsync_DataChangedTranslateEnabledCheckingDisabled()
        {
            var env = new TestEnvironment();
            Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
            env.SetupSFData(true, false, true, books);
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
            Assert.That(projectSecret.SyncUsers.Count, Is.EqualTo(1));
            env.VerifyProjectSync(true);
        }

        [Test]
        public async Task SyncAsync_ChaptersChanged()
        {
            var env = new TestEnvironment();
            env.SetupSFData(true, true, false, new Book("MAT", 2), new Book("MRK", 2));
            env.SetupPTData(new Book("MAT", 3), new Book("MRK", 1));

            await env.Runner.RunAsync("project02", "user01", false, CancellationToken.None);
            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);

            Assert.That(env.ContainsText("project01", "MAT", 3), Is.True);
            Assert.That(env.ContainsText("project01", "MRK", 2), Is.False);

            Assert.That(env.ContainsText("project02", "MAT", 3), Is.True);
            Assert.That(env.ContainsText("project02", "MRK", 2), Is.False);

            Assert.That(env.ContainsQuestion("MAT", 2), Is.True);
            Assert.That(env.ContainsQuestion("MRK", 2), Is.False);
            env.VerifyProjectSync(true);
        }

        [Test]
        public async Task SyncAsync_ChapterValidityChanged()
        {
            var env = new TestEnvironment();
            env.SetupSFData(true, true, false, new Book("MAT", 2), new Book("MRK", 2) { InvalidChapters = { 1 } });
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
            env.SetupSFData(true, true, false, new Book("MAT", 2), new Book("MRK", 2));
            env.SetupPTData(new Book("MAT", 2), new Book("LUK", 2));

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
            env.VerifyProjectSync(true);
        }

        [Test]
        public async Task SyncAsync_UserRoleChangedAndUserRemoved()
        {
            var env = new TestEnvironment();
            Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
            env.SetupSFData(true, true, false, books);
            env.SetupPTData(books);
            var ptUserRoles = new Dictionary<string, string>
            {
                { "pt01", SFProjectRole.Translator }
            };
            env.ParatextService.GetProjectRolesAsync(Arg.Any<UserSecret>(), "target", Arg.Any<CancellationToken>())
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
            env.SetupSFData(true, true, false, books);
            env.SetupPTData(books);
            var ptUserRoles = new Dictionary<string, string>
            {
                { "pt01", SFProjectRole.Translator }
            };
            env.ParatextService.GetProjectRolesAsync(Arg.Any<UserSecret>(), "target", Arg.Any<CancellationToken>())
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
            env.SetupSFData(true, true, false, books);
            env.SetupPTData(books);
            var ptUserRoles = new Dictionary<string, string>
            {
                { "pt01", SFProjectRole.Administrator }
            };
            env.ParatextService.GetProjectRolesAsync(Arg.Any<UserSecret>(), "target", Arg.Any<CancellationToken>())
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
            env.SetupSFData(true, false, false, books);
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
        public async Task SyncAsync_TextDocAlreadyExists()
        {
            var env = new TestEnvironment();
            env.SetupSFData(false, false, false, new Book("MAT", 2), new Book("MRK", 2));
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
            env.SetupSFData(true, true, false, new Book("MAT", 3, 3) { MissingSourceChapters = { 2 } });
            env.SetupPTData(new Book("MAT", 3, true));

            // DB should start with Target chapter 2 but without Source chapter 2.
            Assert.That(env.ContainsText("project01", "MAT", 2), Is.True);
            Assert.That(env.ContainsText("project02", "MAT", 2), Is.False);

            // SUT
            await env.Runner.RunAsync("project02", "user01", false, CancellationToken.None);
            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);

            env.Logger.DidNotReceiveWithAnyArgs().LogError(Arg.Any<Exception>(), default, default);

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
            env.SetupSFData(true, true, false, new Book("MAT", 3, true));
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

            env.Logger.DidNotReceiveWithAnyArgs().LogError(Arg.Any<Exception>(), default, default);

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
            env.SetupSFData(true, true, false, new Book("MAT", 3, 3) { MissingSourceChapters = { 2 } });
            env.SetupPTData(new Book("MAT", 3, 3) { MissingSourceChapters = { 2 } });

            // DB should start without Source chapter 2.
            Assert.That(env.ContainsText("project01", "MAT", 2), Is.True);
            Assert.That(env.ContainsText("project02", "MAT", 2), Is.False);

            // SUT
            await env.Runner.RunAsync("project01", "user01", false, CancellationToken.None);

            env.Logger.DidNotReceiveWithAnyArgs().LogError(Arg.Any<Exception>(), default, default);

            // DB should still be missing Source chapter 2.
            Assert.That(env.ContainsText("project01", "MAT", 2), Is.True);
            Assert.That(env.ContainsText("project02", "MAT", 2), Is.False);
        }

        [Test]
        public async Task SyncAsync_ParatextMissingAllChapters()
        {
            // The project in PT has a book, but no chapters.
            var env = new TestEnvironment();
            env.SetupSFData(true, true, false, new Book("MAT", 3, true));
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

            env.Logger.DidNotReceiveWithAnyArgs().LogError(Arg.Any<Exception>(), default, default);

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
                env.SetupSFData(projectSFId, "project04", translationSuggestionsEnabled, checkingEnabled, changed,
                    books);
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
                    Arg.Any<IEnumerable<IDocument<Question>>>());
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
                env.SetupSFData(projectSFId, "project04", translationSuggestionsEnabled, checkingEnabled, changed,
                    books);
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
                    Arg.Any<IEnumerable<IDocument<Question>>>());
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
            env.SetupSFData(true, true, false);
            env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2));
            var cancellationTokenSource = new CancellationTokenSource();

            // Setup a trap to crash the task
            env.NotesMapper.When(x => x.InitAsync(Arg.Any<UserSecret>(), Arg.Any<SFProjectSecret>(),
                Arg.Any<List<User>>(), Arg.Any<string>(), Arg.Any<CancellationToken>()))
                .Do(_ => throw new ArgumentException());

            // Run the task
            await env.Runner.RunAsync("project01", "user01", false, cancellationTokenSource.Token);

            // Check that the Exception was logged
            env.Logger.ReceivedWithAnyArgs(1).LogError(Arg.Any<Exception>(), default, default);

            // Check that the task cancelled correctly
            SFProject project = env.VerifyProjectSync(false);
            Assert.That(project.Sync.DataInSync, Is.True);  // Nothing was synced as this was cancelled OnInit()
        }

        [Test]
        public async Task SyncAsync_TaskCancelledByException()
        {
            // Set up the environment
            var env = new TestEnvironment();
            env.SetupSFData(true, true, false);
            env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2));
            var cancellationTokenSource = new CancellationTokenSource();

            // Setup a trap to cancel the task
            env.NotesMapper.When(x => x.InitAsync(Arg.Any<UserSecret>(), Arg.Any<SFProjectSecret>(),
                Arg.Any<List<User>>(), Arg.Any<string>(), Arg.Any<CancellationToken>()))
                .Do(_ => throw new TaskCanceledException());

            // Run the task
            await env.Runner.RunAsync("project01", "user01", false, cancellationTokenSource.Token);

            // Check that the TaskCancelledException was not logged
            env.Logger.DidNotReceiveWithAnyArgs().LogError(Arg.Any<Exception>(), default, default);

            // Check that the task cancelled correctly
            SFProject project = env.VerifyProjectSync(false);
            Assert.That(project.Sync.DataInSync, Is.True);  // Nothing was synced as this was cancelled OnInit()
        }

        [Test]
        public async Task SyncAsync_TaskCancelledMidway()
        {
            // Set up the environment
            var env = new TestEnvironment();
            env.SetupSFData(true, true, false);
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
        public async Task SyncAsync_TaskCancelledPrematurely()
        {
            // Set up the environment
            var env = new TestEnvironment();
            env.SetupSFData(true, true, false);
            env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2));
            var cancellationTokenSource = new CancellationTokenSource();

            // Cancel the token before awaiting the task
            cancellationTokenSource.Cancel();

            // Run the task
            await env.Runner.RunAsync("project01", "user01", false, cancellationTokenSource.Token);

            // Check that the task was cancelled after awaiting the check above
            SFProject project = env.VerifyProjectSync(false);
            Assert.That(project.Sync.DataInSync, Is.False);
        }

        [Test]
        public async Task SyncAsync_ExcludesPropertiesFromTransactions()
        {
            // Set up the environment
            var env = new TestEnvironment(substituteRealtimeService: true);
            env.SetupSFData(true, true, false);
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
            env.Connection.Received(2).ExcludePropertyFromTransaction(Arg.Any<Expression<Func<SFProject, object>>>());
        }

        [Test]
        public async Task SyncAsync_TaskCancelledTooLate()
        {
            // Set up the environment
            var env = new TestEnvironment();
            env.SetupSFData(true, true, false);
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
            env.SetupSFData(true, true, false, book);

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
            env.SetupSFData(true, true, false, book);

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
                    new SFProjectSecret { Id = "project01", JobIds = new List<string>{ "test_jobid" } },
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
                ParatextService.GetProjectRolesAsync(Arg.Any<UserSecret>(), "target", Arg.Any<CancellationToken>())
                    .Returns(Task.FromResult<IReadOnlyDictionary<string, string>>(ptUserRoles));
                ParatextService.When(x => x.SendReceiveAsync(Arg.Any<UserSecret>(), Arg.Any<string>(),
                    Arg.Any<IProgress<ProgressState>>(), Arg.Any<CancellationToken>()))
                    .Do(x => _sendReceivedCalled = true);
                ParatextService.IsProjectLanguageRightToLeft(Arg.Any<UserSecret>(), Arg.Any<string>())
                    .Returns(false);
                ParatextService.GetLatestSharedVersion(Arg.Any<UserSecret>(), "target")
                    .Returns("beforeSR", "afterSR");
                ParatextService.GetLatestSharedVersion(Arg.Any<UserSecret>(), "source")
                    .Returns("beforeSR", "afterSR");
                RealtimeService = new SFMemoryRealtimeService();
                Connection = Substitute.For<IConnection>();
                SubstituteRealtimeService = Substitute.For<IRealtimeService>();
                SubstituteRealtimeService.ConnectAsync().Returns(Task.FromResult(Connection));
                DeltaUsxMapper = Substitute.For<IDeltaUsxMapper>();
                NotesMapper = Substitute.For<IParatextNotesMapper>();
                Logger = Substitute.For<ILogger<ParatextSyncRunner>>();

                Runner = new ParatextSyncRunner(userSecrets, _projectSecrets, SFProjectService, EngineService,
                    ParatextService, substituteRealtimeService ? SubstituteRealtimeService : RealtimeService,
                    DeltaUsxMapper, NotesMapper, Logger);
            }

            public ParatextSyncRunner Runner { get; }
            public ISFProjectService SFProjectService { get; }
            public IEngineService EngineService { get; }
            public IParatextNotesMapper NotesMapper { get; }
            public IParatextService ParatextService { get; }
            public SFMemoryRealtimeService RealtimeService { get; }
            public IRealtimeService SubstituteRealtimeService { get; }
            public IDeltaUsxMapper DeltaUsxMapper { get; }
            public ILogger<ParatextSyncRunner> Logger { get; }

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

            public Question GetQuestion(string bookId, int chapter)
            {
                return RealtimeService.GetRepository<Question>().Get($"project01:question{bookId}{chapter}");
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

            public void SetupSFData(bool translationSuggestionsEnabled, bool checkingEnabled, bool changed,
                params Book[] books)
            {
                SetupSFData("project01", "project02", translationSuggestionsEnabled, checkingEnabled, changed, books);
            }

            public void SetupSFData(string targetProjectSFId, string sourceProjectSFId,
                bool translationSuggestionsEnabled, bool checkingEnabled, bool changed,
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
                                SyncedToRepositoryVersion = "beforeSR"
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
                var newSyncUsers = new List<SyncUser>();
                if (changed)
                {
                    notesElem.Add(new XElement("thread"));
                    newSyncUsers.Add(new SyncUser { Id = "syncuser01", ParatextUsername = "User 1" });
                }

                NotesMapper.GetNotesChangelistAsync(Arg.Any<XElement>(),
                    Arg.Any<IEnumerable<IDocument<Question>>>()).Returns(Task.FromResult(notesElem));
                NotesMapper.NewSyncUsers.Returns(newSyncUsers);
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
        }
    }
}
