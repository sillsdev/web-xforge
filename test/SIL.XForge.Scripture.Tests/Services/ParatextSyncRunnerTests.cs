using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Linq;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using NSubstitute;
using NUnit.Framework;
using SIL.Machine.WebApi.Services;
using SIL.Scripture;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.RichText;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Realtime;

namespace SIL.XForge.Scripture.Services
{
    [TestFixture]
    public class ParatextSyncRunnerTests
    {
        [Test]
        public async Task SyncAsync_ProjectDoesNotExist()
        {
            var env = new TestEnvironment();

            await env.Runner.RunAsync("project02", "user01", false);
        }

        [Test]
        public async Task SyncAsync_UserDoesNotExist()
        {
            var env = new TestEnvironment();
            env.SetupSFData(true, true, true);

            await env.Runner.RunAsync("project01", "user02", false);

            SFProject project = env.GetProject();
            Assert.That(project.Sync.QueuedCount, Is.EqualTo(0));
            Assert.That(project.Sync.LastSyncSuccessful, Is.False);
        }

        [Test]
        public async Task SyncAsync_Error()
        {
            var env = new TestEnvironment();
            env.SetupSFData(true, true, false);
            await env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2));
            env.DeltaUsxMapper.When(d => d.ToChapterDeltas(Arg.Any<XDocument>())).Do(x => throw new Exception());

            await env.Runner.RunAsync("project01", "user01", false);

            SFProject project = env.GetProject();
            Assert.That(project.Sync.QueuedCount, Is.EqualTo(0));
            Assert.That(project.Sync.LastSyncSuccessful, Is.False);
        }

        [Test]
        public async Task SyncAsync_NewProjectTranslationSuggestionsAndCheckingDisabled()
        {
            var env = new TestEnvironment();
            env.SetupSFData(false, false, false);
            await env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2, false));

            await env.Runner.RunAsync("project01", "user01", true);

            Assert.That(env.ContainsText("MAT", 1, TextType.Target), Is.True);
            Assert.That(env.ContainsText("MAT", 2, TextType.Target), Is.True);
            Assert.That(env.ContainsText("MRK", 1, TextType.Target), Is.True);
            Assert.That(env.ContainsText("MRK", 2, TextType.Target), Is.True);

            Assert.That(env.ContainsText("MAT", 1, TextType.Source), Is.False);
            Assert.That(env.ContainsText("MAT", 2, TextType.Source), Is.False);
            Assert.That(env.ContainsText("MRK", 1, TextType.Source), Is.False);
            Assert.That(env.ContainsText("MRK", 2, TextType.Source), Is.False);

            Assert.That(env.ContainsQuestion("MAT", 1), Is.False);
            Assert.That(env.ContainsQuestion("MAT", 2), Is.False);
            Assert.That(env.ContainsQuestion("MRK", 1), Is.False);
            Assert.That(env.ContainsQuestion("MRK", 2), Is.False);

            await env.EngineService.DidNotReceive().StartBuildByProjectIdAsync("project01");

            SFProject project = env.GetProject();
            Assert.That(project.Sync.QueuedCount, Is.EqualTo(0));
            Assert.That(project.Sync.LastSyncSuccessful, Is.True);
        }

        [Test]
        public async Task SyncAsync_NewProjectTranslationSuggestionsAndCheckingEnabled()
        {
            var env = new TestEnvironment();
            env.SetupSFData(true, true, false);
            env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2, false));

            await env.Runner.RunAsync("project01", "user01", true);

            Assert.That(env.ContainsText("MAT", 1, TextType.Target), Is.True);
            Assert.That(env.ContainsText("MAT", 2, TextType.Target), Is.True);
            Assert.That(env.ContainsText("MRK", 1, TextType.Target), Is.True);
            Assert.That(env.ContainsText("MRK", 2, TextType.Target), Is.True);

            Assert.That(env.ContainsText("MAT", 1, TextType.Source), Is.True);
            Assert.That(env.ContainsText("MAT", 2, TextType.Source), Is.True);
            Assert.That(env.ContainsText("MRK", 1, TextType.Source), Is.False);
            Assert.That(env.ContainsText("MRK", 2, TextType.Source), Is.False);

            Assert.That(env.ContainsQuestion("MAT", 1), Is.False);
            Assert.That(env.ContainsQuestion("MAT", 2), Is.False);
            Assert.That(env.ContainsQuestion("MRK", 1), Is.False);
            Assert.That(env.ContainsQuestion("MRK", 2), Is.False);

            await env.EngineService.Received().StartBuildByProjectIdAsync("project01");

            SFProject project = env.GetProject();
            Assert.That(project.Sync.QueuedCount, Is.EqualTo(0));
            Assert.That(project.Sync.LastSyncSuccessful, Is.True);
        }

        [Test]
        public async Task SyncAsync_NewProjectOnlyTranslationSuggestionsEnabled()
        {
            var env = new TestEnvironment();
            env.SetupSFData(true, false, false);
            await env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2, false));

            await env.Runner.RunAsync("project01", "user01", true);

            Assert.That(env.ContainsText("MAT", 1, TextType.Target), Is.True);
            Assert.That(env.ContainsText("MAT", 2, TextType.Target), Is.True);
            Assert.That(env.ContainsText("MRK", 1, TextType.Target), Is.True);
            Assert.That(env.ContainsText("MRK", 2, TextType.Target), Is.True);

            Assert.That(env.ContainsText("MAT", 1, TextType.Source), Is.True);
            Assert.That(env.ContainsText("MAT", 2, TextType.Source), Is.True);
            Assert.That(env.ContainsText("MRK", 1, TextType.Source), Is.False);
            Assert.That(env.ContainsText("MRK", 2, TextType.Source), Is.False);

            Assert.That(env.ContainsQuestion("MAT", 1), Is.False);
            Assert.That(env.ContainsQuestion("MAT", 2), Is.False);
            Assert.That(env.ContainsQuestion("MRK", 1), Is.False);
            Assert.That(env.ContainsQuestion("MRK", 2), Is.False);

            await env.EngineService.Received().StartBuildByProjectIdAsync("project01");

            SFProject project = env.GetProject();
            Assert.That(project.Sync.QueuedCount, Is.EqualTo(0));
            Assert.That(project.Sync.LastSyncSuccessful, Is.True);
        }

        [Test]
        public async Task SyncAsync_NewProjectOnlyCheckingEnabled()
        {
            var env = new TestEnvironment();
            env.SetupSFData(false, true, false);
            await env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2, false));

            await env.Runner.RunAsync("project01", "user01", true);

            Assert.That(env.ContainsText("MAT", 1, TextType.Target), Is.True);
            Assert.That(env.ContainsText("MAT", 2, TextType.Target), Is.True);
            Assert.That(env.ContainsText("MRK", 1, TextType.Target), Is.True);
            Assert.That(env.ContainsText("MRK", 2, TextType.Target), Is.True);

            Assert.That(env.ContainsText("MAT", 1, TextType.Source), Is.False);
            Assert.That(env.ContainsText("MAT", 2, TextType.Source), Is.False);
            Assert.That(env.ContainsText("MRK", 1, TextType.Source), Is.False);
            Assert.That(env.ContainsText("MRK", 2, TextType.Source), Is.False);

            Assert.That(env.ContainsQuestion("MAT", 1), Is.False);
            Assert.That(env.ContainsQuestion("MAT", 2), Is.False);
            Assert.That(env.ContainsQuestion("MRK", 1), Is.False);
            Assert.That(env.ContainsQuestion("MRK", 2), Is.False);

            await env.EngineService.DidNotReceive().StartBuildByProjectIdAsync("project01");

            SFProject project = env.GetProject();
            Assert.That(project.Sync.QueuedCount, Is.EqualTo(0));
            Assert.That(project.Sync.LastSyncSuccessful, Is.True);
        }

        [Test]
        public async Task SyncAsync_DataNotChanged()
        {
            var env = new TestEnvironment();
            Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
            env.SetupSFData(true, true, false, books);
            await env.SetupPTData(books);

            await env.Runner.RunAsync("project01", "user01", false);

            env.ParatextService.DidNotReceive().PutBookText("target", 40, Arg.Any<string>());
            env.ParatextService.DidNotReceive().PutBookText("target", 41, Arg.Any<string>());

            env.ParatextService.DidNotReceive().PutBookText("source", 40, Arg.Any<string>());
            env.ParatextService.DidNotReceive().PutBookText("source", 41, Arg.Any<string>());

            var delta = Delta.New().InsertText("text");
            Assert.That(env.GetText("MAT", 1, TextType.Target).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MAT", 2, TextType.Target).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MRK", 1, TextType.Target).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MRK", 2, TextType.Target).DeepEquals(delta), Is.True);

            Assert.That(env.GetText("MAT", 1, TextType.Source).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MAT", 2, TextType.Source).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MRK", 1, TextType.Source).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MRK", 2, TextType.Source).DeepEquals(delta), Is.True);

            env.ParatextService.DidNotReceive().PutNotes("target", Arg.Any<string>());

            SFProjectSecret projectSecret = env.GetProjectSecret();
            Assert.That(projectSecret.SyncUsers.Count, Is.EqualTo(0));

            SFProject project = env.GetProject();
            Assert.That(project.Sync.QueuedCount, Is.EqualTo(0));
            Assert.That(project.Sync.LastSyncSuccessful, Is.True);
            Assert.That(project.UserRoles["user01"], Is.EqualTo(SFProjectRole.Administrator));
            Assert.That(project.UserRoles["user02"], Is.EqualTo(SFProjectRole.Translator));
        }

        [Test]
        public async Task SyncAsync_DataChangedTranslateAndCheckingEnabled()
        {
            var env = new TestEnvironment();
            Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
            env.SetupSFData(true, true, true, books);
            await env.SetupPTData(books);

            await env.Runner.RunAsync("project01", "user01", false);

            env.ParatextService.Received().PutBookText("target", 40, Arg.Any<string>());
            env.ParatextService.Received().PutBookText("target", 41, Arg.Any<string>());

            env.ParatextService.DidNotReceive().PutBookText("source", 40, Arg.Any<string>());
            env.ParatextService.DidNotReceive().PutBookText("source", 41, Arg.Any<string>());

            var delta = Delta.New().InsertText("text");
            Assert.That(env.GetText("MAT", 1, TextType.Target).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MAT", 2, TextType.Target).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MRK", 1, TextType.Target).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MRK", 2, TextType.Target).DeepEquals(delta), Is.True);

            Assert.That(env.GetText("MAT", 1, TextType.Source).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MAT", 2, TextType.Source).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MRK", 1, TextType.Source).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MRK", 2, TextType.Source).DeepEquals(delta), Is.True);

            env.ParatextService.Received(2).PutNotes("target", Arg.Any<string>());

            SFProjectSecret projectSecret = env.GetProjectSecret();
            Assert.That(projectSecret.SyncUsers.Count, Is.EqualTo(1));

            SFProject project = env.GetProject();
            Assert.That(project.Sync.QueuedCount, Is.EqualTo(0));
            Assert.That(project.Sync.LastSyncSuccessful, Is.True);
        }

        [Test]
        public async Task SyncAsync_DataChangedTranslateEnabledCheckingDisabled()
        {
            var env = new TestEnvironment();
            Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
            env.SetupSFData(true, false, true, books);
            await env.SetupPTData(books);

            await env.Runner.RunAsync("project01", "user01", false);

            env.ParatextService.Received().PutBookText("target", 40, Arg.Any<string>());
            env.ParatextService.Received().PutBookText("target", 41, Arg.Any<string>());

            env.ParatextService.DidNotReceive().PutBookText("source", 40, Arg.Any<string>());
            env.ParatextService.DidNotReceive().PutBookText("source", 41, Arg.Any<string>());

            env.ParatextService.DidNotReceive().PutNotes("target", Arg.Any<string>());

            var delta = Delta.New().InsertText("text");
            Assert.That(env.GetText("MAT", 1, TextType.Target).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MAT", 2, TextType.Target).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MRK", 1, TextType.Target).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MRK", 2, TextType.Target).DeepEquals(delta), Is.True);

            Assert.That(env.GetText("MAT", 1, TextType.Source).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MAT", 2, TextType.Source).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MRK", 1, TextType.Source).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MRK", 2, TextType.Source).DeepEquals(delta), Is.True);

            SFProjectSecret projectSecret = env.GetProjectSecret();
            Assert.That(projectSecret.SyncUsers.Count, Is.EqualTo(1));

            SFProject project = env.GetProject();
            Assert.That(project.Sync.QueuedCount, Is.EqualTo(0));
            Assert.That(project.Sync.LastSyncSuccessful, Is.True);
        }

        [Test]
        public async Task SyncAsync_ChaptersChanged()
        {
            var env = new TestEnvironment();
            env.SetupSFData(true, true, false, new Book("MAT", 2), new Book("MRK", 2));
            await env.SetupPTData(new Book("MAT", 3), new Book("MRK", 1));

            await env.Runner.RunAsync("project01", "user01", false);

            Assert.That(env.ContainsText("MAT", 3, TextType.Target), Is.True);
            Assert.That(env.ContainsText("MRK", 2, TextType.Target), Is.False);

            Assert.That(env.ContainsText("MAT", 3, TextType.Source), Is.True);
            Assert.That(env.ContainsText("MRK", 2, TextType.Source), Is.False);

            Assert.That(env.ContainsQuestion("MAT", 2), Is.True);
            Assert.That(env.ContainsQuestion("MRK", 2), Is.False);

            SFProject project = env.GetProject();
            Assert.That(project.Sync.QueuedCount, Is.EqualTo(0));
            Assert.That(project.Sync.LastSyncSuccessful, Is.True);
        }

        [Test]
        public async Task SyncAsync_ChapterValidityChanged()
        {
            var env = new TestEnvironment();
            env.SetupSFData(true, true, false, new Book("MAT", 2), new Book("MRK", 2) { InvalidChapters = { 1 } });
            await env.SetupPTData(new Book("MAT", 2) { InvalidChapters = { 2 } }, new Book("MRK", 2));

            await env.Runner.RunAsync("project01", "user01", false);

            SFProject project = env.GetProject();
            Assert.That(project.Texts[0].Chapters[0].IsValid, Is.True);
            Assert.That(project.Texts[0].Chapters[1].IsValid, Is.False);
            Assert.That(project.Texts[1].Chapters[0].IsValid, Is.True);
            Assert.That(project.Texts[1].Chapters[1].IsValid, Is.True);

            Assert.That(project.Sync.QueuedCount, Is.EqualTo(0));
            Assert.That(project.Sync.LastSyncSuccessful, Is.True);
        }

        [Test]
        public async Task SyncAsync_BooksChanged()
        {
            var env = new TestEnvironment();
            env.SetupSFData(true, true, false, new Book("MAT", 2), new Book("MRK", 2));
            await env.SetupPTData(new Book("MAT", 2), new Book("LUK", 2));

            await env.Runner.RunAsync("project01", "user01", false);

            Assert.That(env.ContainsText("MRK", 1, TextType.Target), Is.False);
            Assert.That(env.ContainsText("MRK", 2, TextType.Target), Is.False);
            Assert.That(env.ContainsText("LUK", 1, TextType.Target), Is.True);
            Assert.That(env.ContainsText("LUK", 2, TextType.Target), Is.True);

            Assert.That(env.ContainsText("MRK", 1, TextType.Source), Is.False);
            Assert.That(env.ContainsText("MRK", 2, TextType.Source), Is.False);
            Assert.That(env.ContainsText("LUK", 1, TextType.Source), Is.True);
            Assert.That(env.ContainsText("LUK", 2, TextType.Source), Is.True);

            Assert.That(env.ContainsQuestion("MRK", 1), Is.False);
            Assert.That(env.ContainsQuestion("MRK", 2), Is.False);
            Assert.That(env.ContainsQuestion("MAT", 1), Is.True);
            Assert.That(env.ContainsQuestion("MAT", 2), Is.True);

            SFProject project = env.GetProject();
            Assert.That(project.Sync.QueuedCount, Is.EqualTo(0));
            Assert.That(project.Sync.LastSyncSuccessful, Is.True);
        }

        [Test]
        public async Task SyncAsync_UserRoleChangedAndUserRemoved()
        {
            var env = new TestEnvironment();
            Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
            env.SetupSFData(true, true, false, books);
            await env.SetupPTData(books);
            var ptUserRoles = new Dictionary<string, string>
            {
                { "pt01", SFProjectRole.Translator }
            };
            env.ParatextService.GetProjectRolesAsync(Arg.Any<UserSecret>(), "target")
                .Returns(Task.FromResult<IReadOnlyDictionary<string, string>>(ptUserRoles));

            await env.Runner.RunAsync("project01", "user01", false);

            SFProject project = env.GetProject();
            Assert.That(project.Sync.QueuedCount, Is.EqualTo(0));
            Assert.That(project.Sync.LastSyncSuccessful, Is.True);
            Assert.That(project.UserRoles["user01"], Is.EqualTo(SFProjectRole.Translator));
            await env.SFProjectService.Received().RemoveUserAsync("user01", "project01", "user02");
        }

        [Test]
        public async Task SyncAsync_CheckerWithPTAccountNotRemoved()
        {
            var env = new TestEnvironment();
            Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
            env.SetupSFData(true, true, false, books);
            await env.SetupPTData(books);
            var ptUserRoles = new Dictionary<string, string>
            {
                { "pt01", SFProjectRole.Administrator }
            };
            env.ParatextService.GetProjectRolesAsync(Arg.Any<UserSecret>(), "target")
                .Returns(Task.FromResult<IReadOnlyDictionary<string, string>>(ptUserRoles));

            await env.SetUserRole("user02", SFProjectRole.CommunityChecker);
            SFProject project = env.GetProject();
            Assert.That(project.UserRoles["user02"], Is.EqualTo(SFProjectRole.CommunityChecker));
            await env.Runner.RunAsync("project01", "user01", false);

            project = env.GetProject();
            Assert.That(project.Sync.QueuedCount, Is.EqualTo(0));
            Assert.That(project.Sync.LastSyncSuccessful, Is.True);
            await env.SFProjectService.DidNotReceiveWithAnyArgs().RemoveUserAsync("user01", "project01", "user02");
        }

        [Test]
        public async Task SyncAsync_TextDocAlreadyExists()
        {
            var env = new TestEnvironment();
            env.SetupSFData(false, false, false, new Book("MAT", 2), new Book("MRK", 2));
            env.RealtimeService.GetRepository<TextData>()
                .Add(new TextData(Delta.New().InsertText("old text"))
                {
                    Id = TextData.GetTextDocId("project01", 42, 1, TextType.Target)
                });
            await env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2), new Book("LUK", 2));

            await env.Runner.RunAsync("project01", "user01", false);

            var delta = Delta.New().InsertText("text");
            Assert.That(env.GetText("MAT", 1, TextType.Target).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MAT", 2, TextType.Target).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MRK", 1, TextType.Target).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MRK", 2, TextType.Target).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("LUK", 1, TextType.Target).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("LUK", 2, TextType.Target).DeepEquals(delta), Is.True);

            SFProject project = env.GetProject();
            Assert.That(project.Sync.QueuedCount, Is.EqualTo(0));
            Assert.That(project.Sync.LastSyncSuccessful, Is.True);
        }

        [Test]
        public async Task SyncAsync_DbMissingChapter()
        {
            // The project in the DB has a book, but a Source chapter is missing from that book.
            var env = new TestEnvironment();
            env.SetupSFData(true, true, false, new Book("MAT", 3, 3) { MissingSourceChapters = { 2 } });
            await env.SetupPTData(new Book("MAT", 3, true));

            // DB should start with Target chapter 2 but without Source chapter 2.
            Assert.That(env.ContainsText("MAT", 2, TextType.Target), Is.True);
            Assert.That(env.ContainsText("MAT", 2, TextType.Source), Is.False);

            // SUT
            await env.Runner.RunAsync("project01", "user01", false);

            env.Logger.DidNotReceiveWithAnyArgs().LogError(Arg.Any<Exception>(), Arg.Any<string>(), Arg.Any<string>());

            var chapterContent = Delta.New().InsertText("text");
            // DB should contain Source chapter 2 now from Paratext.
            Assert.That(env.ContainsText("MAT", 2, TextType.Target), Is.True);
            Assert.That(env.ContainsText("MAT", 2, TextType.Source), Is.True);
            Assert.That(env.GetText("MAT", 2, TextType.Target).DeepEquals(chapterContent), Is.True);
            Assert.That(env.GetText("MAT", 2, TextType.Source).DeepEquals(chapterContent), Is.True);
        }

        [Test]
        public async Task SyncAsync_ParatextMissingChapter()
        {
            // The project in Paratext has a book, but a chapter is missing from that book.
            var env = new TestEnvironment();
            env.SetupSFData(true, true, false, new Book("MAT", 3, true));
            await env.SetupPTData(new Book("MAT", 3, 3) { MissingTargetChapters = { 2 }, MissingSourceChapters = { 2 } });

            var chapterContent = Delta.New().InsertText("text");
            Assert.That(env.ContainsText("MAT", 1, TextType.Target), Is.True);
            Assert.That(env.ContainsText("MAT", 1, TextType.Source), Is.True);
            // DB should start with a chapter 2.
            Assert.That(env.ContainsText("MAT", 2, TextType.Target), Is.True);
            Assert.That(env.ContainsText("MAT", 2, TextType.Source), Is.True);
            Assert.That(env.GetText("MAT", 2, TextType.Target).DeepEquals(chapterContent), Is.True);
            Assert.That(env.GetText("MAT", 2, TextType.Source).DeepEquals(chapterContent), Is.True);
            Assert.That(env.ContainsText("MAT", 3, TextType.Target), Is.True);
            Assert.That(env.ContainsText("MAT", 3, TextType.Source), Is.True);

            // SUT
            await env.Runner.RunAsync("project01", "user01", false);

            env.Logger.DidNotReceiveWithAnyArgs().LogError(Arg.Any<Exception>(), Arg.Any<string>(), Arg.Any<string>());

            // DB should now be missing chapter 2, but retain chapters 1 and 3.
            Assert.That(env.ContainsText("MAT", 1, TextType.Target), Is.True);
            Assert.That(env.ContainsText("MAT", 1, TextType.Source), Is.True);
            Assert.That(env.ContainsText("MAT", 2, TextType.Target), Is.False);
            Assert.That(env.ContainsText("MAT", 2, TextType.Source), Is.False);
            Assert.That(env.ContainsText("MAT", 3, TextType.Target), Is.True);
            Assert.That(env.ContainsText("MAT", 3, TextType.Source), Is.True);
        }

        [Test]
        public async Task SyncAsync_DbAndParatextMissingChapter()
        {
            // The project has a book, but a Source chapter is missing from that book. Both in the DB and in Paratext.
            var env = new TestEnvironment();
            env.SetupSFData(true, true, false, new Book("MAT", 3, 3) { MissingSourceChapters = { 2 } });
            await env.SetupPTData(new Book("MAT", 3, 3) { MissingSourceChapters = { 2 } });

            // DB should start without Source chapter 2.
            Assert.That(env.ContainsText("MAT", 2, TextType.Target), Is.True);
            Assert.That(env.ContainsText("MAT", 2, TextType.Source), Is.False);

            // SUT
            await env.Runner.RunAsync("project01", "user01", false);

            env.Logger.DidNotReceiveWithAnyArgs().LogError(Arg.Any<Exception>(), Arg.Any<string>(), Arg.Any<string>());

            // DB should still be missing Source chapter 2.
            Assert.That(env.ContainsText("MAT", 2, TextType.Target), Is.True);
            Assert.That(env.ContainsText("MAT", 2, TextType.Source), Is.False);
        }

        [Test]
        public async Task SyncAsync_ParatextMissingAllChapters()
        {
            // The project in PT has a book, but no chapters.
            var env = new TestEnvironment();
            env.SetupSFData(true, true, false, new Book("MAT", 3, true));
            await env.SetupPTData(new Book("MAT", 0, true));

            var chapterContent = Delta.New().InsertText("text");
            Assert.That(env.ContainsText("MAT", 1, TextType.Target), Is.True);
            Assert.That(env.ContainsText("MAT", 1, TextType.Source), Is.True);
            Assert.That(env.ContainsText("MAT", 2, TextType.Target), Is.True);
            Assert.That(env.ContainsText("MAT", 2, TextType.Source), Is.True);
            Assert.That(env.GetText("MAT", 2, TextType.Target).DeepEquals(chapterContent), Is.True);
            Assert.That(env.GetText("MAT", 2, TextType.Source).DeepEquals(chapterContent), Is.True);
            Assert.That(env.ContainsText("MAT", 3, TextType.Target), Is.True);
            Assert.That(env.ContainsText("MAT", 3, TextType.Source), Is.True);

            // SUT
            await env.Runner.RunAsync("project01", "user01", false);

            env.Logger.DidNotReceiveWithAnyArgs().LogError(Arg.Any<Exception>(), Arg.Any<string>(), Arg.Any<string>());

            // DB should now be missing all chapters except for the first, implicit chapter.
            Assert.That(env.ContainsText("MAT", 1, TextType.Target), Is.True);
            Assert.That(env.ContainsText("MAT", 1, TextType.Source), Is.True);
            Assert.That(env.ContainsText("MAT", 2, TextType.Target), Is.False);
            Assert.That(env.ContainsText("MAT", 2, TextType.Source), Is.False);
            Assert.That(env.ContainsText("MAT", 3, TextType.Target), Is.False);
            Assert.That(env.ContainsText("MAT", 3, TextType.Source), Is.False);
        }

        [Test]
        public async Task FetchTextDocsAsync_FetchesExistingChapters()
        {
            var env = new TestEnvironment();
            var numberChapters = 3;
            var book = new Book("MAT", numberChapters, true);
            env.SetupSFData(true, true, false, book);
            await env.Runner.InitAsync("project01", "user01");

            // SUT
            SortedList<int, IDocument<TextData>> targetFetch =
                await env.Runner.FetchTextDocsAsync(env.TextInfoFromBook(book), TextType.Target);
            SortedList<int, IDocument<TextData>> sourceFetch =
                await env.Runner.FetchTextDocsAsync(env.TextInfoFromBook(book), TextType.Source);
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
            await env.Runner.InitAsync("project01", "user01");

            // SUT
            var targetFetch = await env.Runner.FetchTextDocsAsync(env.TextInfoFromBook(book), TextType.Target);
            var sourceFetch = await env.Runner.FetchTextDocsAsync(env.TextInfoFromBook(book), TextType.Source);

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
            private readonly IParatextNotesMapper _notesMapper;
            private bool _sendReceivedCalled = false;

            public TestEnvironment()
            {
                IOptions<SiteOptions> siteOptions = Microsoft.Extensions.Options.Options.Create(
                    new SiteOptions()
                    {
                        SiteDir = "scriptureforge"
                    });
                var userSecrets = new MemoryRepository<UserSecret>(new[]
                {
                    new UserSecret { Id = "user01" }
                });
                _projectSecrets = new MemoryRepository<SFProjectSecret>(new[]
                {
                    new SFProjectSecret { Id = "project01" }
                });
                SFProjectService = Substitute.For<ISFProjectService>();
                EngineService = Substitute.For<IEngineService>();
                ParatextService = Substitute.For<IParatextService>();

                var ptUserRoles = new Dictionary<string, string>
                {
                    { "pt01", SFProjectRole.Administrator },
                    { "pt02", SFProjectRole.Translator }
                };
                ParatextService.GetProjectRolesAsync(Arg.Any<UserSecret>(), "target")
                    .Returns(Task.FromResult<IReadOnlyDictionary<string, string>>(ptUserRoles));
                ParatextService.When(x => x.SendReceive(Arg.Any<UserSecret>(), Arg.Any<IEnumerable<string>>()))
                    .Do(x => _sendReceivedCalled = true);
                RealtimeService = new SFMemoryRealtimeService();
                DeltaUsxMapper = Substitute.For<IDeltaUsxMapper>();
                _notesMapper = Substitute.For<IParatextNotesMapper>();
                Logger = Substitute.For<ILogger<ParatextSyncRunner>>();

                Runner = new ParatextSyncRunner(userSecrets, _projectSecrets, SFProjectService, EngineService,
                    ParatextService, RealtimeService, DeltaUsxMapper, _notesMapper, Logger);
            }

            public ParatextSyncRunner Runner { get; }
            public ISFProjectService SFProjectService { get; }
            public IEngineService EngineService { get; }
            public IParatextService ParatextService { get; }
            public SFMemoryRealtimeService RealtimeService { get; }
            public IDeltaUsxMapper DeltaUsxMapper { get; }
            public ILogger<ParatextSyncRunner> Logger { get; }

            public SFProject GetProject()
            {
                return RealtimeService.GetRepository<SFProject>().Get("project01");
            }

            public SFProjectSecret GetProjectSecret()
            {
                return _projectSecrets.Get("project01");
            }

            public bool ContainsText(string bookId, int chapter, TextType textType)
            {
                return RealtimeService.GetRepository<TextData>()
                    .Contains(TextData.GetTextDocId("project01", Canon.BookIdToNumber(bookId), chapter, textType));
            }

            public TextData GetText(string bookId, int chapter, TextType textType)
            {
                return RealtimeService.GetRepository<TextData>()
                    .Get(TextData.GetTextDocId("project01", Canon.BookIdToNumber(bookId), chapter, textType));
            }

            public bool ContainsQuestion(string bookId, int chapter)
            {
                return RealtimeService.GetRepository<Question>().Contains($"project01:question{bookId}{chapter}");
            }

            public Question GetQuestion(string bookId, int chapter)
            {
                return RealtimeService.GetRepository<Question>().Get($"project01:question{bookId}{chapter}");
            }

            public void SetupSFData(bool translationSuggestionsEnabled, bool checkingEnabled, bool changed,
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
                            TranslateConfig = new TranslateConfig
                            {
                                TranslationSuggestionsEnabled = translationSuggestionsEnabled,
                                Source = new TranslateSource
                                {
                                    ParatextId = "source",
                                    Name = "Source",
                                    ShortName = "SRC",
                                    WritingSystem = new WritingSystem
                                    {
                                        Tag = "en"
                                    }
                                }
                            },
                            CheckingConfig = new CheckingConfig
                            {
                                CheckingEnabled = checkingEnabled
                            },
                            Texts = books.Select(b => TextInfoFromBook(b)).ToList(),
                            Sync = new Sync
                            {
                                QueuedCount = 1
                            }
                        }
                    }));

                RealtimeService.AddRepository("texts", OTType.RichText, new MemoryRepository<TextData>());
                RealtimeService.AddRepository("questions", OTType.Json0, new MemoryRepository<Question>());
                foreach (Book book in books)
                {
                    AddSFBook(book.Id, book.HighestTargetChapter, TextType.Target, changed, book.MissingTargetChapters);
                    if (book.HighestSourceChapter > 0)
                        AddSFBook(book.Id, book.HighestSourceChapter, TextType.Source, changed, book.MissingSourceChapters);
                }

                var notesElem = new XElement("notes");
                var newSyncUsers = new List<SyncUser>();
                if (changed)
                {
                    notesElem.Add(new XElement("thread"));
                    newSyncUsers.Add(new SyncUser { Id = "syncuser01", ParatextUsername = "User 1" });
                }

                _notesMapper.GetNotesChangelistAsync(Arg.Any<XElement>(),
                    Arg.Any<IEnumerable<IDocument<Question>>>()).Returns(Task.FromResult(notesElem));
                _notesMapper.NewSyncUsers.Returns(newSyncUsers);
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
                            IsValid = !book.InvalidChapters.Contains(c)
                        }).ToList(),
                    HasSource = book.HighestSourceChapter > 0
                };
            }


            public async Task SetupPTData(params Book[] books)
            {
                ParatextService.GetBooks("target")
                    .Returns(books.Select(b => Canon.BookIdToNumber(b.Id)).ToArray());
                // Include book with Source even if there are no chapters, if there are also no chapters in Target. PT
                // can actually have or not have books which do or do not have chapters more flexibly than this. But in
                // this way, allow tests to request a Source book exist even with zero chapters.
                ParatextService.GetBooks("source")
                    .Returns(books
                        .Where(b => b.HighestSourceChapter > 0 || b.HighestSourceChapter == b.HighestTargetChapter)
                        .Select(b => Canon.BookIdToNumber(b.Id)).ToArray());
                foreach (Book book in books)
                {
                    await AddPTBook(book.Id, book.HighestTargetChapter, TextType.Target, book.MissingTargetChapters, book.InvalidChapters);
                    if (book.HighestSourceChapter > 0 || book.HighestSourceChapter == book.HighestTargetChapter)
                        await AddPTBook(book.Id, book.HighestSourceChapter, TextType.Source, book.MissingSourceChapters);
                }
            }

            public Task SetUserRole(string userId, string role)
            {
                return RealtimeService.GetRepository<SFProject>().UpdateAsync(p => p.Id == "project01", u =>
                    u.Set(pr => pr.UserRoles[userId], role));
            }

            private async Task AddPTBook(string bookId, int highestChapter, TextType textType, HashSet<int> missingChapters,
                HashSet<int> invalidChapters = null)
            {
                await MockGetBookText(bookId, textType);
                string paratextProject = GetParatextProject(textType);
                Func<XDocument, bool> predicate = d => (string)d?.Root?.Element("book")?.Attribute("code") == bookId
                        && (string)d?.Root?.Element("book") == paratextProject;
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

            private void AddSFBook(string bookId, int highestChapter, TextType textType, bool changed, HashSet<int> missingChapters = null)
            {
                MockGetBookText(bookId, textType);
                int bookNum = Canon.BookIdToNumber(bookId);
                string newBookText = GetBookText(textType, bookId, changed ? 2 : 1);
                Func<XDocument, bool> predicate = d => (string)d?.Root?.Element("book")?.Attribute("code") == bookId
                    && (string)d?.Root?.Element("book") == GetParatextProject(textType);
                DeltaUsxMapper.ToUsx(Arg.Is<XDocument>(d => predicate(d)), Arg.Any<IEnumerable<ChapterDelta>>())
                    .Returns(XDocument.Parse(newBookText));

                for (int c = 1; c <= highestChapter; c++)
                {
                    string id = TextData.GetTextDocId("project01", bookNum, c, textType);
                    if (!(missingChapters?.Contains(c) ?? false))
                    {
                        RealtimeService.GetRepository<TextData>()
                            .Add(new TextData(Delta.New().InsertText(changed ? "changed" : "text")) { Id = id });
                    }
                    RealtimeService.GetRepository<Question>().Add(new[]
                    {
                        new Question
                        {
                            Id = $"project01:question{bookId}{c}",
                            DataId = $"question{bookId}{c}",
                            ProjectRef = "project01",
                            VerseRef = new VerseRefData(bookNum, c, 1)
                        }
                    });
                }
            }

            private async Task MockGetBookText(string bookId, TextType textType)
            {
                string paratextProject = GetParatextProject(textType);
                string oldBookText = GetBookText(textType, bookId, 1);
                string remoteBookText = GetBookText(textType, bookId, 3);
                ParatextService.GetBookText(Arg.Any<UserSecret>(), paratextProject, Canon.BookIdToNumber(bookId))
                    .Returns(x => _sendReceivedCalled ? remoteBookText : oldBookText);
            }

            private static string GetBookText(TextType textType, string bookId, int version)
            {
                string projectName = GetParatextProject(textType);
                return $"<usx version=\"2.5\"><book code=\"{bookId}\" style=\"id\">{projectName}</book><content version=\"{version}\"/></usx>";
            }

            private static string GetParatextProject(TextType textType)
            {
                string projectName;
                switch (textType)
                {
                    case TextType.Source:
                        projectName = "source";
                        break;
                    case TextType.Target:
                        projectName = "target";
                        break;
                    default:
                        throw new InvalidEnumArgumentException(nameof(textType), (int)textType, typeof(TextType));
                }
                return projectName;
            }
        }
    }
}
