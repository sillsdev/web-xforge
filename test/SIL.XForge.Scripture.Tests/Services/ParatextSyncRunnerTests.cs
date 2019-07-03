using System.Xml.Linq;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using NSubstitute;
using NUnit.Framework;
using SIL.Machine.WebApi.Services;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Realtime.RichText;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;
using System.ComponentModel;

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
        }

        [Test]
        public async Task SyncAsync_UserDoesNotExist()
        {
            var env = new TestEnvironment();
            env.SetupProjectData(true, true);

            await env.Runner.RunAsync("project01", "user02", false);

            await env.RealtimeService.Received().ConnectAsync();
            await env.ProjectDataDoc.Received().SubmitOpAsync(Arg.Any<object>());
        }

        [Test]
        public async Task SyncAsync_NewProject()
        {
            var env = new TestEnvironment();
            env.SetupProjectData(true, true);
            env.SetupParatextData(
                new TextInfo
                {
                    BookId = "MAT",
                    Chapters =
                    {
                        new Chapter { Number = 1, LastVerse = 3 },
                        new Chapter { Number = 2, LastVerse = 3 }
                    },
                    HasSource = true
                },
                new TextInfo
                {
                    BookId = "MRK",
                    Chapters =
                    {
                        new Chapter { Number = 1, LastVerse = 3 },
                        new Chapter { Number = 2, LastVerse = 3 }
                    },
                    HasSource = true
                });

            await env.Runner.RunAsync("project01", "user01", false);
        }

        // [Test]
        // public async Task SyncOrClone_YesFileYesDb()
        // {
        //     var env = new TestEnvironment();

        //     env.Connection.Get<Delta>(null, null).ReturnsForAnyArgs(env.Document);

        //     var newFileBuffer = new byte[1000];
        //     var newFileStream = new MemoryStream(newFileBuffer);
        //     env.FileSystemService.CreateFile(Arg.Any<string>()).Returns(newFileStream);
        //     env.FileSystemService.FileExists(Arg.Any<string>()).Returns(true);

        //     string fileOnDisk = env.usxText;
        //     var loadStream = new MemoryStream(Encoding.UTF8.GetBytes(fileOnDisk));
        //     env.FileSystemService.OpenFile(Arg.Any<string>(), Arg.Any<FileMode>()).Returns(loadStream);

        //     List<Chapter> resultingChapters = await env.Runner.SyncOrCloneBookUsxAsync(env.Text, TextType.Source,
        //         env.Project.ParatextId, false);
        //     var unionOfParatextCloudAndMongoChapters = 2;
        //     Assert.That(resultingChapters.Count, Is.EqualTo(unionOfParatextCloudAndMongoChapters),
        //         "Did not process data as expected");

        //     // Assert that PT cloud was updated from mongo
        //     await env.ParatextService.ReceivedWithAnyArgs().UpdateBookTextAsync(null, null, null, null, null);

        //     var textWrittenToDisk = System.Text.Encoding.UTF8.GetString(newFileStream.ToArray());
        //     Assert.That(textWrittenToDisk, Does.Contain("<usx"));

        //     // Assert that mongo was updated
        //     await env.Document.ReceivedWithAnyArgs().SubmitOpAsync(null);

        // }

        // [Test]
        // public async Task SyncOrClone_NoFileNoDB()
        // {
        //     var env = new TestEnvironment();

        //     env.Connection.Get<Delta>("abc", "abc").ReturnsForAnyArgs(env.EmptyDocument);

        //     var newFileBuffer = new byte[1000];
        //     var newFileStream = new MemoryStream(newFileBuffer);
        //     env.FileSystemService.CreateFile(Arg.Any<string>()).Returns(newFileStream);
        //     env.FileSystemService.FileExists(Arg.Any<string>()).Returns(false);

        //     string fileOnDisk = env.usxText;
        //     var loadStream = new MemoryStream(Encoding.UTF8.GetBytes(fileOnDisk));
        //     env.FileSystemService.OpenFile(Arg.Any<string>(), Arg.Any<FileMode>()).Returns(loadStream);

        //     List<Chapter> resultingChapters = await env.Runner.SyncOrCloneBookUsxAsync(env.Text, TextType.Source,
        //         env.Project.ParatextId, false);
        //     var unionOfParatextCloudAndMongoChapters = 2;
        //     Assert.That(resultingChapters.Count, Is.EqualTo(unionOfParatextCloudAndMongoChapters),
        //         "Did not process data as expected");

        //     // Assert that PT cloud was not written to
        //     await env.ParatextService.DidNotReceiveWithAnyArgs().UpdateBookTextAsync(null, null, null, null, null);

        //     var textWrittenToDisk = Encoding.UTF8.GetString(newFileStream.ToArray());
        //     Assert.That(textWrittenToDisk, Does.Contain("<usx"));

        //     // Assert that data was created in mongo
        //     await env.EmptyDocument.Received().CreateAsync(Arg.Any<Delta>());
        // }

        // [Test]
        // public async Task SyncOrClone_NoFileYesDb()
        // {
        //     var env = new TestEnvironment();

        //     env.Connection.Get<Delta>(null, null).ReturnsForAnyArgs(env.Document);

        //     var newFileBuffer = new byte[1000];
        //     var newFileStream = new MemoryStream(newFileBuffer);
        //     env.FileSystemService.CreateFile(Arg.Any<string>()).Returns(newFileStream);
        //     env.FileSystemService.FileExists(Arg.Any<string>()).Returns(false);

        //     List<Chapter> resultingChapters = await env.Runner.SyncOrCloneBookUsxAsync(env.Text, TextType.Source,
        //         env.Project.ParatextId, false);
        //     var unionOfParatextCloudAndMongoChapters = 2;
        //     Assert.That(resultingChapters.Count, Is.EqualTo(unionOfParatextCloudAndMongoChapters),
        //         "Did not process data as expected");

        //     // Assert that PT cloud was not written to
        //     await env.ParatextService.DidNotReceiveWithAnyArgs().UpdateBookTextAsync(null, null, null, null, null);

        //     var textWrittenToDisk = Encoding.UTF8.GetString(newFileStream.ToArray());
        //     Assert.That(textWrittenToDisk, Does.Contain("<usx"));

        //     // Assert that mongo text_data records were deleted and re-created.
        //     await env.Document.ReceivedWithAnyArgs().DeleteAsync();
        //     await env.Document.ReceivedWithAnyArgs().CreateAsync(Arg.Any<Delta>());
        // }

        // [Test]
        // public async Task FetchAndSaveBook()
        // {
        //     var env = new TestEnvironment();
        //     var buffer = new byte[1000];
        //     var steamToDisk = new MemoryStream(buffer);
        //     env.FileSystemService.CreateFile("/nonexistent/path.xml").Returns(steamToDisk);

        //     var text = new TextInfo { BookId = "abc" };
        //     var outputUsx = await env.Runner.FetchAndSaveBookUsxAsync(text, null, "/nonexistent/path.xml");
        //     var textWrittenToDisk = Encoding.UTF8.GetString(steamToDisk.ToArray());
        //     Assert.That(textWrittenToDisk, Does.Contain("<usx"));
        //     Assert.That(outputUsx.Name.ToString(), Is.EqualTo("BookText"));
        // }

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
            private readonly IConnection _conn;

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
                Projects = new MemoryRepository<SFProjectEntity>();
                var engineService = Substitute.For<IEngineService>();
                ParatextService = Substitute.For<IParatextService>();
                _conn = Substitute.For<IConnection>();
                RealtimeService = Substitute.For<IRealtimeService>();
                RealtimeService.ConnectAsync().Returns(Task.FromResult(_conn));
                FileSystemService = Substitute.For<IFileSystemService>();
                DeltaUsxMapper = Substitute.For<IDeltaUsxMapper>();
                NotesMapper = Substitute.For<IParatextNotesMapper>();
                var logger = Substitute.For<ILogger<ParatextSyncRunner>>();

                Runner = new ParatextSyncRunner(siteOptions, users, Projects, engineService, ParatextService,
                    RealtimeService, FileSystemService, DeltaUsxMapper, NotesMapper, logger);
            }

            public ParatextSyncRunner Runner { get; }
            public MemoryRepository<SFProjectEntity> Projects { get; }
            public IParatextService ParatextService { get; }
            public IFileSystemService FileSystemService { get; }
            public IRealtimeService RealtimeService { get; }
            public IDeltaUsxMapper DeltaUsxMapper { get; }
            public IParatextNotesMapper NotesMapper { get; }
            public IDocument<SFProjectData> ProjectDataDoc { get; private set; }

            public void SetupProjectData(bool translateEnabled, bool checkingEnabled, params TextInfo[] texts)
            {
                Projects.Add(new SFProjectEntity
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

                ProjectDataDoc = Substitute.For<IDocument<SFProjectData>>();
                ProjectDataDoc.Id.Returns("project01");
                ProjectDataDoc.IsLoaded.Returns(true);
                _conn.Get<SFProjectData>(RootDataTypes.Projects, "project01").Returns(ProjectDataDoc);
                ProjectDataDoc.Data.Returns(new SFProjectData
                {
                    Texts = texts.ToList(),
                    Sync = new Sync
                    {
                        QueuedCount = 1
                    }
                });

                foreach (TextInfo text in texts)
                {
                    AddTextData(text, TextType.Target);
                    if (text.HasSource)
                        AddTextData(text, TextType.Source);
                }
            }

            public void SetupParatextData(params Book[] books)
            {
                ParatextService.GetBooksAsync(Arg.Any<UserEntity>(), "target")
                    .Returns(books.Select(b => b.Id).ToArray());
                ParatextService.GetBooksAsync(Arg.Any<UserEntity>(), "source")
                    .Returns(books.Where(b => b.SourceChapterCount > 0).Select(b => b.Id).ToArray());
                foreach (Book book in books)
                {
                    AddParatextBook(book.Id, book.TargetChapterCount, TextType.Target);
                    if (book.SourceChapterCount > 0)
                        AddParatextBook(book.Id, book.SourceChapterCount, TextType.Source);
                }
            }

            private void AddParatextBook(string bookId, int chapterCount, TextType textType)
            {
                string bookText = GetBookText(textType, bookId);
                ParatextService.GetBookTextAsync(Arg.Any<UserEntity>(), "target", bookId)
                    .Returns(Task.FromResult(bookText));
                ParatextService.UpdateBookTextAsync(Arg.Any<UserEntity>(), "target", bookId,
                    Arg.Any<string>(), Arg.Any<string>()).Returns(Task.FromResult(bookText));
                FileSystemService.CreateFile($"/scriptureforge/target/{text.BookId}.xml")
                    .Returns(new MemoryStream());
                var chapterDeltas = text.Chapters.ToDictionary(c => c.Number, c => (new Delta(), c.LastVerse));
                DeltaUsxMapper.ToChapterDeltas(
                    Arg.Is<XElement>(e => (string)e.Element("usx").Element("book").Attribute("code") == text.BookId))
                        .Returns(chapterDeltas);
            }

            private void AddTextData(TextInfo text, TextType textType)
            {
                string bookText = GetBookText(textType, text.BookId);
                string filename = GetUsxFileName(textType, text.BookId);
                FileSystemService.OpenFile(filename, FileMode.Open)
                    .Returns(new MemoryStream(Encoding.UTF8.GetBytes(bookText)));
                FileSystemService.FileExists(filename).Returns(true);
                DeltaUsxMapper.ToUsx("2.5", text.BookId, GetParatextProject(textType), Arg.Any<IEnumerable<Delta>>())
                    .Returns(XElement.Parse(bookText));

                foreach (Chapter chapter in text.Chapters)
                {
                    string id = TextInfo.GetTextDocId("project01", text.BookId, chapter.Number, textType);
                    var textDoc = Substitute.For<IDocument<Delta>>();
                    textDoc.Id.Returns(id);
                    textDoc.Data.Returns(new Delta());
                    _conn.Get<Delta>(SFRootDataTypes.Texts, id).Returns(textDoc);
                    var questionsDoc = Substitute.For<IDocument<List<Question>>>();
                    questionsDoc.Id.Returns(id);
                    questionsDoc.Data.Returns(new List<Question>());
                    _conn.Get<List<Question>>(SFRootDataTypes.Questions, id).Returns(questionsDoc);
                    var commentsDoc = Substitute.For<IDocument<List<Comment>>>();
                    commentsDoc.Id.Returns(id);
                    commentsDoc.Data.Returns(new List<Comment>());
                    _conn.Get<List<Comment>>(SFRootDataTypes.Comments, id).Returns(commentsDoc);
                }
            }

            private static string GetBookText(TextType textType, string bookId)
            {
                string projectName = GetParatextProject(textType);
                return $"<BookText revision=\"1\"><usx version=\"2.5\"><book code=\"{bookId}\" style=\"id\">{projectName}</book></usx></BookText>";
            }

            private static string GetUsxFileName(TextType textType, string bookId)
            {
                string textTypeDir = GetParatextProject(textType);
                return Path.Combine("scriptureforge", "project01", textTypeDir, bookId + ".xml");
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
