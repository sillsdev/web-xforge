using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Text;
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
using SIL.XForge.Services;

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

            await env.ParatextService.DidNotReceive().GetBooksAsync(Arg.Any<UserSecret>(), "project01");
            SFProject project = env.GetProject();
            Assert.That(project.Sync.QueuedCount, Is.EqualTo(0));
            Assert.That(project.Sync.LastSyncSuccessful, Is.False);
        }

        [Test]
        public async Task SyncAsync_Error()
        {
            var env = new TestEnvironment();
            env.SetupSFData(true, true, false);
            env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2));
            env.DeltaUsxMapper.When(d => d.ToChapterDeltas(Arg.Any<XElement>())).Do(x => throw new Exception());

            await env.Runner.RunAsync("project01", "user01", false);

            env.FileSystemService.DidNotReceive().CreateFile(TestEnvironment.GetUsxFileName(TextType.Target, "MAT"));
            SFProject project = env.GetProject();
            Assert.That(project.Sync.QueuedCount, Is.EqualTo(0));
            Assert.That(project.Sync.LastSyncSuccessful, Is.False);
        }

        [Test]
        public async Task SyncAsync_NewProjectTranslationSuggestionsAndCheckingDisabled()
        {
            var env = new TestEnvironment();
            env.SetupSFData(false, false, false);
            env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2, false));

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
        public async Task SyncAsync_NewProjectOnlyCheckingEnabled()
        {
            var env = new TestEnvironment();
            env.SetupSFData(false, true, false);
            env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2, false));

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
            env.SetupPTData(books);

            await env.Runner.RunAsync("project01", "user01", false);

            await env.ParatextService.DidNotReceive().UpdateBookTextAsync(Arg.Any<UserSecret>(), "target", "MAT",
                Arg.Any<string>(), Arg.Any<string>());
            await env.ParatextService.DidNotReceive().UpdateBookTextAsync(Arg.Any<UserSecret>(), "target", "MRK",
                Arg.Any<string>(), Arg.Any<string>());

            await env.ParatextService.DidNotReceive().UpdateBookTextAsync(Arg.Any<UserSecret>(), "source", "MAT",
                Arg.Any<string>(), Arg.Any<string>());
            await env.ParatextService.DidNotReceive().UpdateBookTextAsync(Arg.Any<UserSecret>(), "source", "MRK",
                Arg.Any<string>(), Arg.Any<string>());

            var delta = Delta.New().InsertText("text");
            Assert.That(env.GetText("MAT", 1, TextType.Target).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MAT", 2, TextType.Target).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MRK", 1, TextType.Target).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MRK", 2, TextType.Target).DeepEquals(delta), Is.True);

            Assert.That(env.GetText("MAT", 1, TextType.Source).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MAT", 2, TextType.Source).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MRK", 1, TextType.Source).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MRK", 2, TextType.Source).DeepEquals(delta), Is.True);

            await env.ParatextService.DidNotReceive().UpdateNotesAsync(Arg.Any<UserSecret>(), "target",
                Arg.Any<string>());

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
            env.SetupPTData(books);

            await env.Runner.RunAsync("project01", "user01", false);

            await env.ParatextService.Received().UpdateBookTextAsync(Arg.Any<UserSecret>(), "target", "MAT",
                Arg.Any<string>(), Arg.Any<string>());
            await env.ParatextService.Received().UpdateBookTextAsync(Arg.Any<UserSecret>(), "target", "MRK",
                Arg.Any<string>(), Arg.Any<string>());

            await env.ParatextService.DidNotReceive().UpdateBookTextAsync(Arg.Any<UserSecret>(), "source", "MAT",
                Arg.Any<string>(), Arg.Any<string>());
            await env.ParatextService.DidNotReceive().UpdateBookTextAsync(Arg.Any<UserSecret>(), "source", "MRK",
                Arg.Any<string>(), Arg.Any<string>());

            var delta = Delta.New().InsertText("text");
            Assert.That(env.GetText("MAT", 1, TextType.Target).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MAT", 2, TextType.Target).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MRK", 1, TextType.Target).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MRK", 2, TextType.Target).DeepEquals(delta), Is.True);

            Assert.That(env.GetText("MAT", 1, TextType.Source).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MAT", 2, TextType.Source).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MRK", 1, TextType.Source).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MRK", 2, TextType.Source).DeepEquals(delta), Is.True);

            await env.ParatextService.Received(2).UpdateNotesAsync(Arg.Any<UserSecret>(), "target", Arg.Any<string>());

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
            env.SetupPTData(books);

            await env.Runner.RunAsync("project01", "user01", false);

            await env.ParatextService.Received().UpdateBookTextAsync(Arg.Any<UserSecret>(), "target", "MAT",
                Arg.Any<string>(), Arg.Any<string>());
            await env.ParatextService.Received().UpdateBookTextAsync(Arg.Any<UserSecret>(), "target", "MRK",
                Arg.Any<string>(), Arg.Any<string>());

            await env.ParatextService.DidNotReceive().UpdateBookTextAsync(Arg.Any<UserSecret>(), "source", "MAT",
                Arg.Any<string>(), Arg.Any<string>());
            await env.ParatextService.DidNotReceive().UpdateBookTextAsync(Arg.Any<UserSecret>(), "source", "MRK",
                Arg.Any<string>(), Arg.Any<string>());

            await env.ParatextService.DidNotReceive().UpdateNotesAsync(Arg.Any<UserSecret>(), "target",
                Arg.Any<string>());

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
            env.SetupPTData(new Book("MAT", 3), new Book("MRK", 1));

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
        public async Task SyncAsync_BooksChanged()
        {
            var env = new TestEnvironment();
            env.SetupSFData(true, true, false, new Book("MAT", 2), new Book("MRK", 2));
            env.SetupPTData(new Book("MAT", 2), new Book("LUK", 2));

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
        public async Task SyncAsync_MissingUsxFile()
        {
            var env = new TestEnvironment();
            Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
            env.SetupSFData(false, true, true, books);
            env.FileSystemService.FileExists(TestEnvironment.GetUsxFileName(TextType.Target, "MAT")).Returns(false);
            env.FileSystemService.EnumerateFiles(TestEnvironment.GetProjectPath(TextType.Target))
                .Returns(new[] { "MRK.xml" });
            env.SetupPTData(books);

            await env.Runner.RunAsync("project01", "user01", false);

            var delta = Delta.New().InsertText("text");
            Assert.That(env.GetText("MAT", 1, TextType.Target).DeepEquals(delta), Is.True);
            Assert.That(env.GetText("MAT", 2, TextType.Target).DeepEquals(delta), Is.True);

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
            env.SetupPTData(books);
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

        private class Book
        {
            public Book(string bookId, int chapterCount, bool hasSource = true)
                : this(bookId, chapterCount, hasSource ? chapterCount : 0)
            {
            }

            public Book(string bookId, int targetChapterCount, int sourceChapterCount)
            {
                Id = bookId;
                TargetChapterCount = targetChapterCount;
                SourceChapterCount = sourceChapterCount;
            }

            public string Id { get; }
            public int TargetChapterCount { get; }
            public int SourceChapterCount { get; }
        }

        private class TestEnvironment
        {
            private readonly MemoryRepository<SFProjectSecret> _projectSecrets;
            private readonly IParatextNotesMapper _notesMapper;

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
                RealtimeService = new SFMemoryRealtimeService();
                FileSystemService = Substitute.For<IFileSystemService>();
                DeltaUsxMapper = Substitute.For<IDeltaUsxMapper>();
                _notesMapper = Substitute.For<IParatextNotesMapper>();
                var logger = Substitute.For<ILogger<ParatextSyncRunner>>();

                Runner = new ParatextSyncRunner(siteOptions, userSecrets, _projectSecrets, SFProjectService,
                    EngineService, ParatextService, RealtimeService, FileSystemService, DeltaUsxMapper, _notesMapper,
                    logger);
            }

            public ParatextSyncRunner Runner { get; }
            public ISFProjectService SFProjectService { get; }
            public IEngineService EngineService { get; }
            public IParatextService ParatextService { get; }
            public SFMemoryRealtimeService RealtimeService { get; }
            public IFileSystemService FileSystemService { get; }
            public IDeltaUsxMapper DeltaUsxMapper { get; }

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
                            Texts = books.Select(b =>
                                new TextInfo
                                {
                                    BookNum = Canon.BookIdToNumber(b.Id),
                                    Chapters = Enumerable.Range(1, b.TargetChapterCount)
                                        .Select(c => new Chapter { Number = c, LastVerse = 10 }).ToList(),
                                    HasSource = b.SourceChapterCount > 0
                                }).ToList(),
                            Sync = new Sync
                            {
                                QueuedCount = 1
                            }
                        }
                    }));

                if (books.Length > 0)
                {
                    string targetPath = GetProjectPath(TextType.Target);
                    FileSystemService.DirectoryExists(targetPath).Returns(true);
                    FileSystemService.EnumerateFiles(targetPath).Returns(books.Select(b => $"{b.Id}.xml"));
                    string sourcePath = GetProjectPath(TextType.Source);
                    FileSystemService.DirectoryExists(sourcePath).Returns(true);
                    FileSystemService.EnumerateFiles(sourcePath)
                        .Returns(books.Where(b => b.SourceChapterCount > 0).Select(b => $"{b.Id}.xml"));
                }

                RealtimeService.AddRepository("texts", OTType.RichText, new MemoryRepository<TextData>());
                RealtimeService.AddRepository("questions", OTType.Json0, new MemoryRepository<Question>());
                foreach (Book book in books)
                {
                    AddSFBook(book.Id, book.TargetChapterCount, TextType.Target, changed);
                    if (book.SourceChapterCount > 0)
                        AddSFBook(book.Id, book.SourceChapterCount, TextType.Source, changed);
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

            public void SetupPTData(params Book[] books)
            {
                ParatextService.GetBooksAsync(Arg.Any<UserSecret>(), "target")
                    .Returns(books.Select(b => b.Id).ToArray());
                ParatextService.GetBooksAsync(Arg.Any<UserSecret>(), "source")
                    .Returns(books.Where(b => b.SourceChapterCount > 0).Select(b => b.Id).ToArray());
                foreach (Book book in books)
                {
                    AddPTBook(book.Id, book.TargetChapterCount, TextType.Target);
                    if (book.SourceChapterCount > 0)
                        AddPTBook(book.Id, book.SourceChapterCount, TextType.Source);
                }
            }

            public static string GetUsxFileName(TextType textType, string bookId)
            {
                return Path.Combine(GetProjectPath(textType), bookId + ".xml");
            }

            public static string GetProjectPath(TextType textType)
            {
                return Path.Combine("scriptureforge", "sync", "project01", GetParatextProject(textType));
            }

            private void AddPTBook(string bookId, int chapterCount, TextType textType)
            {
                string paratextProject = GetParatextProject(textType);

                string bookText = GetBookText(textType, bookId, 3);
                ParatextService.GetBookTextAsync(Arg.Any<UserSecret>(), paratextProject, bookId)
                    .Returns(Task.FromResult(bookText));
                ParatextService.UpdateBookTextAsync(Arg.Any<UserSecret>(), paratextProject, bookId,
                    Arg.Any<string>(), Arg.Any<string>()).Returns(Task.FromResult(bookText));
                FileSystemService.CreateFile(GetUsxFileName(textType, bookId)).Returns(new MemoryStream());
                Func<XElement, bool> predicate = e => (string)e?.Element("book")?.Attribute("code") == bookId
                        && (string)e?.Element("book") == paratextProject;
                var chapterDeltas = Enumerable.Range(1, chapterCount)
                    .ToDictionary(c => c, c => (Delta.New().InsertText("text"), 10));
                DeltaUsxMapper.ToChapterDeltas(Arg.Is<XElement>(e => predicate(e))).Returns(chapterDeltas);
            }

            private void AddSFBook(string bookId, int chapterCount, TextType textType, bool changed)
            {
                int bookNum = Canon.BookIdToNumber(bookId);
                string oldBookText = GetBookText(textType, bookId, 1);
                string filename = GetUsxFileName(textType, bookId);
                FileSystemService.OpenFile(filename, FileMode.Open)
                    .Returns(new MemoryStream(Encoding.UTF8.GetBytes(oldBookText)));
                FileSystemService.FileExists(filename).Returns(true);
                string newBookText = GetBookText(textType, bookId, changed ? 2 : 1);
                DeltaUsxMapper.ToUsx("2.5", bookId, GetParatextProject(textType), Arg.Any<IEnumerable<Delta>>())
                    .Returns(XElement.Parse(newBookText).Element("usx"));

                for (int c = 1; c <= chapterCount; c++)
                {
                    string id = TextData.GetTextDocId("project01", bookNum, c, textType);
                    RealtimeService.GetRepository<TextData>()
                        .Add(new TextData(Delta.New().InsertText(changed ? "changed" : "text")) { Id = id });
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

            private static string GetBookText(TextType textType, string bookId, int version)
            {
                string projectName = GetParatextProject(textType);
                return $"<BookText revision=\"1\"><usx version=\"2.5\"><book code=\"{bookId}\" style=\"id\">{projectName}</book><content version=\"{version}\"/></usx></BookText>";
            }

            private static string GetBookNotes(TextType textType, string bookId)
            {
                string projectName = GetParatextProject(textType);
                return $"<Notes project=\"{projectName}\" book=\"{bookId}\"/>";
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
