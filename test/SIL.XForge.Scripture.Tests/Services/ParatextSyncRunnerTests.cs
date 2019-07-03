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
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.RichText;
using SIL.XForge.Scripture.Models;
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

            await env.RealtimeService.DidNotReceive().ConnectAsync();
            await env.ProjectDataDoc.DidNotReceive().SubmitOpAsync(Arg.Any<object>());
        }

        [Test]
        public async Task SyncAsync_UserDoesNotExist()
        {
            var env = new TestEnvironment();
            env.SetupSFData(true, true, true);

            await env.Runner.RunAsync("project01", "user02", false);

            await env.RealtimeService.Received().ConnectAsync();
            await env.ParatextService.DidNotReceive().GetBooksAsync(Arg.Any<UserEntity>(), "project01");
            await env.ProjectDataDoc.Received(1).SubmitOpAsync(Arg.Any<object>());
        }

        [Test]
        public async Task SyncAsync_Error()
        {
            var env = new TestEnvironment();
            Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
            env.SetupSFData(true, true, false, books);
            env.SetupPTData(books);
            env.ParatextService
                .When(p => p.GetBooksAsync(Arg.Any<UserEntity>(), "target"))
                .Do(x => throw new Exception());

            await env.Runner.RunAsync("project01", "user01", false);

            await env.ProjectDataDoc.Received(2).SubmitOpAsync(Arg.Any<object>());
        }

        [Test]
        public async Task SyncAsync_NewProjectTranslateAndCheckingEnabled()
        {
            var env = new TestEnvironment();
            env.SetupSFData(true, true, false);
            env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2, false));

            await env.Runner.RunAsync("project01", "user01", true);

            await env.GetTextDoc("MAT", 1, TextType.Target).Received().CreateAsync(Arg.Any<Delta>());
            await env.GetTextDoc("MAT", 2, TextType.Target).Received().CreateAsync(Arg.Any<Delta>());
            await env.GetTextDoc("MRK", 1, TextType.Target).Received().CreateAsync(Arg.Any<Delta>());
            await env.GetTextDoc("MRK", 2, TextType.Target).Received().CreateAsync(Arg.Any<Delta>());

            await env.GetTextDoc("MAT", 1, TextType.Source).Received().CreateAsync(Arg.Any<Delta>());
            await env.GetTextDoc("MAT", 2, TextType.Source).Received().CreateAsync(Arg.Any<Delta>());
            await env.GetTextDoc("MRK", 1, TextType.Source).DidNotReceive().CreateAsync(Arg.Any<Delta>());
            await env.GetTextDoc("MRK", 2, TextType.Source).DidNotReceive().CreateAsync(Arg.Any<Delta>());

            await env.GetQuestionsDoc("MAT", 1).Received().CreateAsync(Arg.Any<List<Question>>());
            await env.GetQuestionsDoc("MAT", 2).Received().CreateAsync(Arg.Any<List<Question>>());
            await env.GetQuestionsDoc("MRK", 1).Received().CreateAsync(Arg.Any<List<Question>>());
            await env.GetQuestionsDoc("MRK", 2).Received().CreateAsync(Arg.Any<List<Question>>());

            await env.GetCommentsDoc("MAT", 1).Received().CreateAsync(Arg.Any<List<Comment>>());
            await env.GetCommentsDoc("MAT", 2).Received().CreateAsync(Arg.Any<List<Comment>>());
            await env.GetCommentsDoc("MRK", 1).Received().CreateAsync(Arg.Any<List<Comment>>());
            await env.GetCommentsDoc("MRK", 2).Received().CreateAsync(Arg.Any<List<Comment>>());

            await env.EngineService.Received().StartBuildByProjectIdAsync("project01");

            await env.ProjectDataDoc.Received(12).SubmitOpAsync(Arg.Any<object>());
        }

        [Test]
        public async Task SyncAsync_NewProjectOnlyTranslateEnabled()
        {
            var env = new TestEnvironment();
            env.SetupSFData(true, false, false);
            env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2, false));

            await env.Runner.RunAsync("project01", "user01", true);

            await env.GetTextDoc("MAT", 1, TextType.Target).Received().CreateAsync(Arg.Any<Delta>());
            await env.GetTextDoc("MAT", 2, TextType.Target).Received().CreateAsync(Arg.Any<Delta>());
            await env.GetTextDoc("MRK", 1, TextType.Target).DidNotReceive().CreateAsync(Arg.Any<Delta>());
            await env.GetTextDoc("MRK", 2, TextType.Target).DidNotReceive().CreateAsync(Arg.Any<Delta>());

            await env.GetTextDoc("MAT", 1, TextType.Source).Received().CreateAsync(Arg.Any<Delta>());
            await env.GetTextDoc("MAT", 2, TextType.Source).Received().CreateAsync(Arg.Any<Delta>());
            await env.GetTextDoc("MRK", 1, TextType.Source).DidNotReceive().CreateAsync(Arg.Any<Delta>());
            await env.GetTextDoc("MRK", 2, TextType.Source).DidNotReceive().CreateAsync(Arg.Any<Delta>());

            await env.GetQuestionsDoc("MAT", 1).Received().CreateAsync(Arg.Any<List<Question>>());
            await env.GetQuestionsDoc("MAT", 2).Received().CreateAsync(Arg.Any<List<Question>>());
            await env.GetQuestionsDoc("MRK", 1).DidNotReceive().CreateAsync(Arg.Any<List<Question>>());
            await env.GetQuestionsDoc("MRK", 2).DidNotReceive().CreateAsync(Arg.Any<List<Question>>());

            await env.GetCommentsDoc("MAT", 1).Received().CreateAsync(Arg.Any<List<Comment>>());
            await env.GetCommentsDoc("MAT", 2).Received().CreateAsync(Arg.Any<List<Comment>>());
            await env.GetCommentsDoc("MRK", 1).DidNotReceive().CreateAsync(Arg.Any<List<Comment>>());
            await env.GetCommentsDoc("MRK", 2).DidNotReceive().CreateAsync(Arg.Any<List<Comment>>());

            await env.EngineService.Received().StartBuildByProjectIdAsync("project01");

            await env.ProjectDataDoc.Received(7).SubmitOpAsync(Arg.Any<object>());
        }

        [Test]
        public async Task SyncAsync_NewProjectOnlyCheckingEnabled()
        {
            var env = new TestEnvironment();
            env.SetupSFData(false, true, false);
            env.SetupPTData(new Book("MAT", 2), new Book("MRK", 2, false));

            await env.Runner.RunAsync("project01", "user01", true);

            await env.GetTextDoc("MAT", 1, TextType.Target).Received().CreateAsync(Arg.Any<Delta>());
            await env.GetTextDoc("MAT", 2, TextType.Target).Received().CreateAsync(Arg.Any<Delta>());
            await env.GetTextDoc("MRK", 1, TextType.Target).Received().CreateAsync(Arg.Any<Delta>());
            await env.GetTextDoc("MRK", 2, TextType.Target).Received().CreateAsync(Arg.Any<Delta>());

            await env.GetTextDoc("MAT", 1, TextType.Source).DidNotReceive().CreateAsync(Arg.Any<Delta>());
            await env.GetTextDoc("MAT", 2, TextType.Source).DidNotReceive().CreateAsync(Arg.Any<Delta>());
            await env.GetTextDoc("MRK", 1, TextType.Source).DidNotReceive().CreateAsync(Arg.Any<Delta>());
            await env.GetTextDoc("MRK", 2, TextType.Source).DidNotReceive().CreateAsync(Arg.Any<Delta>());

            await env.GetQuestionsDoc("MAT", 1).Received().CreateAsync(Arg.Any<List<Question>>());
            await env.GetQuestionsDoc("MAT", 2).Received().CreateAsync(Arg.Any<List<Question>>());
            await env.GetQuestionsDoc("MRK", 1).Received().CreateAsync(Arg.Any<List<Question>>());
            await env.GetQuestionsDoc("MRK", 2).Received().CreateAsync(Arg.Any<List<Question>>());

            await env.GetCommentsDoc("MAT", 1).Received().CreateAsync(Arg.Any<List<Comment>>());
            await env.GetCommentsDoc("MAT", 2).Received().CreateAsync(Arg.Any<List<Comment>>());
            await env.GetCommentsDoc("MRK", 1).Received().CreateAsync(Arg.Any<List<Comment>>());
            await env.GetCommentsDoc("MRK", 2).Received().CreateAsync(Arg.Any<List<Comment>>());

            await env.EngineService.DidNotReceive().StartBuildByProjectIdAsync("project01");

            await env.ProjectDataDoc.Received(10).SubmitOpAsync(Arg.Any<object>());
        }

        [Test]
        public async Task SyncAsync_DataNotChanged()
        {
            var env = new TestEnvironment();
            Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
            env.SetupSFData(true, true, false, books);
            env.SetupPTData(books);

            await env.Runner.RunAsync("project01", "user01", false);

            await env.ParatextService.DidNotReceive().UpdateBookTextAsync(Arg.Any<UserEntity>(), "target", "MAT",
                Arg.Any<string>(), Arg.Any<string>());
            await env.ParatextService.DidNotReceive().UpdateBookTextAsync(Arg.Any<UserEntity>(), "target", "MRK",
                Arg.Any<string>(), Arg.Any<string>());

            await env.ParatextService.DidNotReceive().UpdateBookTextAsync(Arg.Any<UserEntity>(), "source", "MAT",
                Arg.Any<string>(), Arg.Any<string>());
            await env.ParatextService.DidNotReceive().UpdateBookTextAsync(Arg.Any<UserEntity>(), "source", "MRK",
                Arg.Any<string>(), Arg.Any<string>());

            await env.GetQuestionsDoc("MAT", 1).DidNotReceive().SubmitOpAsync(Arg.Any<object>());
            await env.GetQuestionsDoc("MAT", 2).DidNotReceive().SubmitOpAsync(Arg.Any<object>());
            await env.GetQuestionsDoc("MRK", 1).DidNotReceive().SubmitOpAsync(Arg.Any<object>());
            await env.GetQuestionsDoc("MRK", 2).DidNotReceive().SubmitOpAsync(Arg.Any<object>());

            await env.GetCommentsDoc("MAT", 1).DidNotReceive().SubmitOpAsync(Arg.Any<object>());
            await env.GetCommentsDoc("MAT", 2).DidNotReceive().SubmitOpAsync(Arg.Any<object>());
            await env.GetCommentsDoc("MRK", 1).DidNotReceive().SubmitOpAsync(Arg.Any<object>());
            await env.GetCommentsDoc("MRK", 2).DidNotReceive().SubmitOpAsync(Arg.Any<object>());

            await env.ParatextService.DidNotReceive().UpdateNotesAsync(Arg.Any<UserEntity>(), "target",
                Arg.Any<string>());

            Assert.That(env.Project.SyncUsers.Count, Is.EqualTo(0));

            await env.ProjectDataDoc.Received(14).SubmitOpAsync(Arg.Any<object>());
        }

        [Test]
        public async Task SyncAsync_DataChangedTranslateAndCheckingEnabled()
        {
            var env = new TestEnvironment();
            Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
            env.SetupSFData(true, true, true, books);
            env.SetupPTData(books);

            await env.Runner.RunAsync("project01", "user01", false);

            await env.ParatextService.Received().UpdateBookTextAsync(Arg.Any<UserEntity>(), "target", "MAT",
                Arg.Any<string>(), Arg.Any<string>());
            await env.ParatextService.Received().UpdateBookTextAsync(Arg.Any<UserEntity>(), "target", "MRK",
                Arg.Any<string>(), Arg.Any<string>());

            await env.ParatextService.DidNotReceive().UpdateBookTextAsync(Arg.Any<UserEntity>(), "source", "MAT",
                Arg.Any<string>(), Arg.Any<string>());
            await env.ParatextService.DidNotReceive().UpdateBookTextAsync(Arg.Any<UserEntity>(), "source", "MRK",
                Arg.Any<string>(), Arg.Any<string>());

            await env.ParatextService.Received(2).UpdateNotesAsync(Arg.Any<UserEntity>(), "target", Arg.Any<string>());

            Assert.That(env.Project.SyncUsers.Count, Is.EqualTo(1));

            await env.ProjectDataDoc.Received(14).SubmitOpAsync(Arg.Any<object>());
        }

        [Test]
        public async Task SyncAsync_DataChangedOnlyTranslateEnabled()
        {
            var env = new TestEnvironment();
            Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
            env.SetupSFData(true, false, true, books);
            env.SetupPTData(books);

            await env.Runner.RunAsync("project01", "user01", false);

            await env.ParatextService.Received().UpdateBookTextAsync(Arg.Any<UserEntity>(), "target", "MAT",
                Arg.Any<string>(), Arg.Any<string>());
            await env.ParatextService.Received().UpdateBookTextAsync(Arg.Any<UserEntity>(), "target", "MRK",
                Arg.Any<string>(), Arg.Any<string>());

            await env.ParatextService.DidNotReceive().UpdateBookTextAsync(Arg.Any<UserEntity>(), "source", "MAT",
                Arg.Any<string>(), Arg.Any<string>());
            await env.ParatextService.DidNotReceive().UpdateBookTextAsync(Arg.Any<UserEntity>(), "source", "MRK",
                Arg.Any<string>(), Arg.Any<string>());

            await env.ParatextService.DidNotReceive().UpdateNotesAsync(Arg.Any<UserEntity>(), "target",
                Arg.Any<string>());

            Assert.That(env.Project.SyncUsers.Count, Is.EqualTo(1));

            await env.ProjectDataDoc.Received(12).SubmitOpAsync(Arg.Any<object>());
        }

        [Test]
        public async Task SyncAsync_ChaptersChanged()
        {
            var env = new TestEnvironment();
            env.SetupSFData(true, true, false, new Book("MAT", 2), new Book("MRK", 2));
            env.SetupPTData(new Book("MAT", 3), new Book("MRK", 1));

            await env.Runner.RunAsync("project01", "user01", false);

            await env.GetTextDoc("MAT", 3, TextType.Target).Received().CreateAsync(Arg.Any<Delta>());
            await env.GetTextDoc("MRK", 2, TextType.Target).Received().DeleteAsync();

            await env.GetTextDoc("MAT", 3, TextType.Target).Received().CreateAsync(Arg.Any<Delta>());
            await env.GetTextDoc("MRK", 2, TextType.Source).Received().DeleteAsync();

            await env.GetQuestionsDoc("MAT", 3).Received().CreateAsync(Arg.Any<List<Question>>());
            await env.GetQuestionsDoc("MRK", 2).Received().DeleteAsync();

            await env.GetCommentsDoc("MAT", 3).Received().CreateAsync(Arg.Any<List<Comment>>());
            await env.GetCommentsDoc("MRK", 2).Received().DeleteAsync();

            await env.ProjectDataDoc.Received(14).SubmitOpAsync(Arg.Any<object>());
        }

        [Test]
        public async Task SyncAsync_BooksChanged()
        {
            var env = new TestEnvironment();
            env.SetupSFData(true, true, false, new Book("MAT", 2), new Book("MRK", 2));
            env.SetupPTData(new Book("MAT", 2), new Book("LUK", 2));

            await env.Runner.RunAsync("project01", "user01", false);

            await env.GetTextDoc("MRK", 1, TextType.Target).Received().DeleteAsync();
            await env.GetTextDoc("MRK", 2, TextType.Target).Received().DeleteAsync();
            await env.GetTextDoc("LUK", 1, TextType.Target).Received().CreateAsync(Arg.Any<Delta>());
            await env.GetTextDoc("LUK", 2, TextType.Target).Received().CreateAsync(Arg.Any<Delta>());

            await env.GetTextDoc("MRK", 1, TextType.Source).Received().DeleteAsync();
            await env.GetTextDoc("MRK", 2, TextType.Source).Received().DeleteAsync();
            await env.GetTextDoc("LUK", 1, TextType.Source).Received().CreateAsync(Arg.Any<Delta>());
            await env.GetTextDoc("LUK", 2, TextType.Source).Received().CreateAsync(Arg.Any<Delta>());

            await env.GetQuestionsDoc("MRK", 1).Received().DeleteAsync();
            await env.GetQuestionsDoc("MRK", 2).Received().DeleteAsync();
            await env.GetQuestionsDoc("LUK", 1).Received().CreateAsync(Arg.Any<List<Question>>());
            await env.GetQuestionsDoc("LUK", 2).Received().CreateAsync(Arg.Any<List<Question>>());

            await env.GetCommentsDoc("MRK", 1).Received().DeleteAsync();
            await env.GetCommentsDoc("MRK", 2).Received().DeleteAsync();
            await env.GetCommentsDoc("LUK", 1).Received().CreateAsync(Arg.Any<List<Comment>>());
            await env.GetCommentsDoc("LUK", 2).Received().CreateAsync(Arg.Any<List<Comment>>());

            await env.ProjectDataDoc.Received(16).SubmitOpAsync(Arg.Any<object>());
        }

        [Test]
        public async Task SyncAsync_MissingUsxFile()
        {
            var env = new TestEnvironment();
            Book[] books = { new Book("MAT", 2), new Book("MRK", 2) };
            env.SetupSFData(false, true, false, books);
            env.FileSystemService.FileExists(TestEnvironment.GetUsxFileName(TextType.Target, "MAT")).Returns(false);
            env.FileSystemService.EnumerateFiles(TestEnvironment.GetProjectPath(TextType.Target))
                .Returns(new[] { "MRK.xml" });
            env.SetupPTData(books);

            await env.Runner.RunAsync("project01", "user01", false);

            await env.GetTextDoc("MAT", 1, TextType.Target).Received().DeleteAsync();
            await env.GetTextDoc("MAT", 2, TextType.Target).Received().DeleteAsync();
            await env.GetTextDoc("MAT", 1, TextType.Target).Received().CreateAsync(Arg.Any<Delta>());
            await env.GetTextDoc("MAT", 2, TextType.Target).Received().CreateAsync(Arg.Any<Delta>());

            await env.ProjectDataDoc.Received(8).SubmitOpAsync(Arg.Any<object>());
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
            private readonly MemoryRepository<SFProjectEntity> _projects;
            private readonly IConnection _conn;
            private readonly IDeltaUsxMapper _deltaUsxMapper;
            private readonly IParatextNotesMapper _notesMapper;

            public TestEnvironment()
            {
                IOptions<SiteOptions> siteOptions = Microsoft.Extensions.Options.Options.Create(
                    new SiteOptions()
                    {
                        SiteDir = "scriptureforge"
                    });
                var users = new MemoryRepository<UserEntity>(new[]
                    {
                        new UserEntity
                        {
                            Id = "user01"
                        }
                    });
                _projects = new MemoryRepository<SFProjectEntity>();
                EngineService = Substitute.For<IEngineService>();
                ParatextService = Substitute.For<IParatextService>();
                _conn = Substitute.For<IConnection>();
                RealtimeService = Substitute.For<IRealtimeService>();
                RealtimeService.ConnectAsync().Returns(Task.FromResult(_conn));
                FileSystemService = Substitute.For<IFileSystemService>();
                _deltaUsxMapper = Substitute.For<IDeltaUsxMapper>();
                _notesMapper = Substitute.For<IParatextNotesMapper>();
                var logger = Substitute.For<ILogger<ParatextSyncRunner>>();

                Runner = new ParatextSyncRunner(siteOptions, users, _projects, EngineService, ParatextService,
                    RealtimeService, FileSystemService, _deltaUsxMapper, _notesMapper, logger);
            }

            public ParatextSyncRunner Runner { get; }
            public IEngineService EngineService { get; }
            public IParatextService ParatextService { get; }
            public IRealtimeService RealtimeService { get; }
            public IFileSystemService FileSystemService { get; }
            public SFProjectEntity Project => _projects.Get("project01");
            public IDocument<SFProjectData> ProjectDataDoc => _conn.Get<SFProjectData>(RootDataTypes.Projects,
                "project01");

            public IDocument<Delta> GetTextDoc(string bookId, int chapter, TextType textType)
            {
                return _conn.Get<Delta>(SFRootDataTypes.Texts,
                    TextInfo.GetTextDocId("project01", bookId, chapter, textType));
            }

            public IDocument<List<Question>> GetQuestionsDoc(string bookId, int chapter)
            {
                return _conn.Get<List<Question>>(SFRootDataTypes.Questions,
                    TextInfo.GetTextDocId("project01", bookId, chapter));
            }

            public IDocument<List<Comment>> GetCommentsDoc(string bookId, int chapter)
            {
                return _conn.Get<List<Comment>>(SFRootDataTypes.Comments,
                    TextInfo.GetTextDocId("project01", bookId, chapter));
            }

            public void SetupSFData(bool translateEnabled, bool checkingEnabled, bool changed, params Book[] books)
            {
                _projects.Add(new SFProjectEntity
                {
                    Id = "project01",
                    ProjectName = "project01",
                    Users =
                        {
                            new SFProjectUserEntity
                            {
                                Id = "projectuser01",
                                UserRef = "user01",
                                Role = SFProjectRoles.Administrator
                            }
                        },
                    ParatextId = "target",
                    SourceParatextId = "source",
                    TranslateEnabled = translateEnabled,
                    CheckingEnabled = checkingEnabled
                });

                var projectDataDoc = Substitute.For<IDocument<SFProjectData>>();
                projectDataDoc.Id.Returns("project01");
                projectDataDoc.IsLoaded.Returns(true);
                projectDataDoc.Data.Returns(new SFProjectData
                {
                    Texts = books.Select(b =>
                        new TextInfo
                        {
                            BookId = b.Id,
                            Chapters = Enumerable.Range(1, b.TargetChapterCount)
                                .Select(c => new Chapter { Number = c, LastVerse = 10 }).ToList()
                        }).ToList(),
                    Sync = new Sync
                    {
                        QueuedCount = 1
                    }
                });
                _conn.Get<SFProjectData>(RootDataTypes.Projects, "project01").Returns(projectDataDoc);

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
                    Arg.Any<IEnumerable<IDocument<List<Question>>>>(),
                    Arg.Any<IEnumerable<IDocument<List<Comment>>>>()).Returns(Task.FromResult(notesElem));
                _notesMapper.NewSyncUsers.Returns(newSyncUsers);
            }

            public void SetupPTData(params Book[] books)
            {
                ParatextService.GetBooksAsync(Arg.Any<UserEntity>(), "target")
                    .Returns(books.Select(b => b.Id).ToArray());
                ParatextService.GetBooksAsync(Arg.Any<UserEntity>(), "source")
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
                ParatextService.GetBookTextAsync(Arg.Any<UserEntity>(), paratextProject, bookId)
                    .Returns(Task.FromResult(bookText));
                ParatextService.UpdateBookTextAsync(Arg.Any<UserEntity>(), paratextProject, bookId,
                    Arg.Any<string>(), Arg.Any<string>()).Returns(Task.FromResult(bookText));
                FileSystemService.CreateFile(GetUsxFileName(textType, bookId)).Returns(new MemoryStream());
                Func<XElement, bool> predicate = e => (string)e?.Element("book")?.Attribute("code") == bookId
                        && (string)e?.Element("book") == paratextProject;
                var chapterDeltas = Enumerable.Range(1, chapterCount).ToDictionary(c => c, c => (new Delta(), 10));
                _deltaUsxMapper.ToChapterDeltas(Arg.Is<XElement>(e => predicate(e))).Returns(chapterDeltas);
            }

            private void AddSFBook(string bookId, int chapterCount, TextType textType, bool changed)
            {
                string oldBookText = GetBookText(textType, bookId, 1);
                string filename = GetUsxFileName(textType, bookId);
                FileSystemService.OpenFile(filename, FileMode.Open)
                    .Returns(new MemoryStream(Encoding.UTF8.GetBytes(oldBookText)));
                FileSystemService.FileExists(filename).Returns(true);
                string newBookText = GetBookText(textType, bookId, changed ? 2 : 1);
                _deltaUsxMapper.ToUsx("2.5", bookId, GetParatextProject(textType), Arg.Any<IEnumerable<Delta>>())
                    .Returns(XElement.Parse(newBookText).Element("usx"));

                for (int c = 1; c <= chapterCount; c++)
                {
                    string id = TextInfo.GetTextDocId("project01", bookId, c, textType);
                    var textDoc = Substitute.For<IDocument<Delta>>();
                    textDoc.Id.Returns(id);
                    textDoc.IsLoaded.Returns(true);
                    textDoc.Data.Returns(new Delta());
                    _conn.Get<Delta>(SFRootDataTypes.Texts, id).Returns(textDoc);
                    var questionsDoc = Substitute.For<IDocument<List<Question>>>();
                    questionsDoc.Id.Returns(id);
                    questionsDoc.IsLoaded.Returns(true);
                    questionsDoc.Data.Returns(new List<Question>());
                    _conn.Get<List<Question>>(SFRootDataTypes.Questions, id).Returns(questionsDoc);
                    var commentsDoc = Substitute.For<IDocument<List<Comment>>>();
                    commentsDoc.Id.Returns(id);
                    commentsDoc.IsLoaded.Returns(true);
                    commentsDoc.Data.Returns(new List<Comment>());
                    _conn.Get<List<Comment>>(SFRootDataTypes.Comments, id).Returns(commentsDoc);
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
