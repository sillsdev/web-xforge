using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Options;
using NSubstitute;
using NUnit.Framework;
using SIL.Scripture;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Realtime;
using System.IO;
using Paratext.Data.Repository;
using Paratext.Data.Users;
using PtxUtils;
using SIL.XForge.Services;
using Paratext.Base;
using Paratext.Data.ProjectComments;

namespace SIL.XForge.Scripture.Services
{
    [TestFixture]
    public class ParatextServiceTests
    {
        private MockScrText _paratextProject;
        private CommentManager _manager;

        [SetUp]
        public void SetUp()
        {
            string ruthBookUsfm = "\\id RUT - ProjectNameHere\n" +
                "\\c 1\n" +
                "\\v 1 Verse 1 here.\n" +
                "\\v 2 Verse 2 here.";

            _paratextProject = new MockScrText();
            _paratextProject.Data.Add("RUT", ruthBookUsfm);
            _manager = CommentManager.Get(_paratextProject);
            if (!Directory.Exists(_paratextProject.Directory))
                Directory.CreateDirectory(_paratextProject.Directory);
        }

        [TearDown]
        public void TearDown()
        {
            CommentManager.RemoveCommentManager(_paratextProject);
            Directory.Delete(_paratextProject.Directory, true);
        }

        [Test]
        public void GetProjectsAsync_BadArguments()
        {
            var env = new TestEnvironment();
            Assert.ThrowsAsync<ArgumentNullException>(() => env.Service.GetProjectsAsync(null));
        }

        [Test]
        public async Task GetProjectsAsync_ReturnCorrectRepos()
        {
            var env = new TestEnvironment();
            UserSecret user01Secret = env.MakeUserSecret(env.User01);
            env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);

            // SUT
            IEnumerable<ParatextProject> repos = await env.Service.GetProjectsAsync(user01Secret);

            // Right number of repos returned.
            Assert.That(repos.Count(), Is.EqualTo(3));

            // Repos returned are the ones we expect.
            // TODO Make PT repos in data that should not be returned.
            foreach (string projectName in new string[] { env.Project01, env.Project02, env.Project03 })
            {
                Assert.That(repos.Single(project => project.ParatextId == "paratext_" + projectName), Is.Not.Null);
            }

            // Properties of one of the returned repos have the correct values.
            ParatextProject expectedProject01 = new ParatextProject
            {
                ParatextId = "paratext_" + env.Project01,
                Name = env.Project01,
                ShortName = "P01",
                LanguageTag = "writingsystem_tag",
                SFProjectId = "sf_id_" + env.Project01,
                // Not connectable since sf project exists and sf user is on sf project.
                IsConnectable = false,
                // Is connected since is in SF database and user is on project
                IsConnected = true
            };
            Assert.That(repos.Single(project => project.ParatextId == "paratext_" + env.Project01).ExpressiveToString(), Is.EqualTo(expectedProject01.ExpressiveToString()));

            // TODO Work on alphabetical when am more easily getting names for repos.
            // Repos are returned in alphabetical order by paratext project name.
            // List<string> repoList = repos.Select(repo => repo.Name).ToList();
            // foreach (var a in repoList) { Console.WriteLine("DEBUG: item is:" + a); }
            // Assert.That(StringComparer.InvariantCultureIgnoreCase.Compare(repoList[0], repoList[1]), Is.LessThan(0));
            // Assert.That(StringComparer.InvariantCultureIgnoreCase.Compare(repoList[1], repoList[2]), Is.LessThan(0));
        }

        [Test]
        public async Task GetProjectsAsync_ConnectedConnectable()
        {
            var env = new TestEnvironment();
            UserSecret user01Secret = env.MakeUserSecret(env.User01);
            env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
            UserSecret user03Secret = env.MakeUserSecret(env.User03);
            env.SetSharedRepositorySource(user03Secret, UserRoles.TeamMember);

            // Check resulting IsConnectable and IsConnected values across various scenarios of SF project existing, SF user being a member of the SF project, and PT user being an admin on PT project.

            var testCases = new[]
            {
                new
                {
                    // Data
                    paratextProjectId = "paratext_" + env.Project01,
                    sfUserId = env.User01,
                    ptUsername = "user 01",
                    userSecret = user01Secret,
                    // Environmental assumptions
                    sfProjectExists = true,
                    sfUserIsOnSfProject = true,
                    ptUserIsAdminOnPtProject = true,
                    // Expectation to assert
                    isConnected = true,
                    reason1 = "sf project exists and sf user is member of the sf project",
                    isConnectable = false,
                    reason2 = "can not re-connect to project"
                },
                new
                {
                    paratextProjectId = "paratext_" + env.Project01,
                    sfUserId = env.User03,
                    ptUsername = "user 01",
                    userSecret = user03Secret,

                    sfProjectExists = true,
                    sfUserIsOnSfProject = false,
                    ptUserIsAdminOnPtProject = false,

                    isConnected = false,
                    reason1 = "sf project exists and but sf user is not member of the sf project",
                    isConnectable = true,
                    reason2 = "can connect to existing SF project"
                },
                new
                {
                    paratextProjectId = "paratext_" + env.Project02,
                    sfUserId = env.User01,
                    ptUsername = "user 01",
                    userSecret = user01Secret,

                    sfProjectExists = false,
                    sfUserIsOnSfProject = false,
                    ptUserIsAdminOnPtProject = true,

                    isConnected = false,
                    reason1 = "sf project does not exist",
                    isConnectable = true,
                    reason2 = "pt admin can start connection to not-yet-existing sf project"
                },
                new
                {
                    paratextProjectId = "paratext_" + env.Project02,
                    sfUserId = env.User03,
                    ptUsername = "user 03",
                    userSecret = user03Secret,

                    sfProjectExists = false,
                    sfUserIsOnSfProject = false,
                    ptUserIsAdminOnPtProject = false,

                    isConnected = false,
                    reason1 = "sf project does not exist",
                    isConnectable = false,
                    reason2 = "pt non-admin can not start connection to not-yet-existing sf project"
                },
            };

            foreach (var testCase in testCases)
            {
                // Check that assumptions are true.
                Assert.That((await env.RealtimeService.GetRepository<SFProject>().GetAllAsync()).Any(sfProject => sfProject.ParatextId == testCase.paratextProjectId), Is.EqualTo(testCase.sfProjectExists), "not set up - whether sf project exists or not");
                if (testCase.sfProjectExists)
                {
                    Assert.That((await env.RealtimeService.GetRepository<SFProject>().GetAllAsync()).Single(sfProject => sfProject.ParatextId == testCase.paratextProjectId).UserRoles.ContainsKey(testCase.sfUserId), Is.EqualTo(testCase.sfUserIsOnSfProject), "not set up - whether user is on existing sf project or not");
                }
                Assert.That(env.Service._internetSharedRepositorySource[testCase.sfUserId]
                    .GetRepositories()
                    .FirstOrDefault(sharedRepository => sharedRepository.SendReceiveId == testCase.paratextProjectId)
                    .SourceUsers
                    .GetRole(testCase.ptUsername) == UserRoles.Administrator, Is.EqualTo(testCase.ptUserIsAdminOnPtProject), "not set up - whether pt user is an admin on pt project");

                // SUT
                ParatextProject resultingProjectToExamine = (await env.Service.GetProjectsAsync(testCase.userSecret)).Single(project => project.ParatextId == testCase.paratextProjectId);

                // Assert expectations.
                Assert.That(resultingProjectToExamine.IsConnected, Is.EqualTo(testCase.isConnected), testCase.reason1);
                Assert.That(resultingProjectToExamine.IsConnectable, Is.EqualTo(testCase.isConnectable), testCase.reason2);
            }
        }

        [Test]
        public async Task GetBooks_ReturnCorrectNumberOfBooks()
        {
            var env = new TestEnvironment();
            MockScrText paratextProject = new MockScrText();
            // Books 1 thru 3.
            paratextProject.Settings.BooksPresentSet = new BookSet(1, 3);
            string paratextProjectId = "ptId123";
            env.MockedScrTextCollectionRunner.FindById(paratextProjectId).Returns(paratextProject);

            IReadOnlyList<int> result = env.Service.GetBookList(paratextProjectId);
            Assert.That(result.Count(), Is.EqualTo(3));
            Assert.That(result, Is.EquivalentTo(new[] { 1, 2, 3 }));
        }

        [Test]
        public async Task GetBookText_Works()
        {
            string paratextProjectId = "ptId123";
            string ruthBookUsfm = "\\id RUT - ProjectNameHere\n" +
                "\\c 1\n" +
                "\\v 1 Verse 1 here.\n" +
                "\\v 2 Verse 2 here.";
            string ruthBookUsx = "<usx version=\"3.0\">\r\n  <book code=\"RUT\" style=\"id\">- ProjectNameHere</book>\r\n  <chapter number=\"1\" style=\"c\" />\r\n  <verse number=\"1\" style=\"v\" />Verse 1 here. <verse number=\"2\" style=\"v\" />Verse 2 here.</usx>";

            MockScrText paratextProject = new MockScrText();
            paratextProject.Data.Add("RUT", ruthBookUsfm);
            var env = new TestEnvironment();
            env.MockedScrTextCollectionRunner.FindById(paratextProjectId).Returns(paratextProject);
            // env.MockedScrTextCollectionRunner.GetById(paratextProjectId).Returns(paratextProject);

            // SUT
            string result = await env.Service.GetBookTextAsync(null, paratextProjectId, 8);
            Assert.That(result, Is.EqualTo(ruthBookUsx));
            Assert.That(paratextProject.Settings.Encoder is HackStringEncoder, Is.True, "codepage 1252 workaround needs to be in place");
        }

        [Test]
        public async Task GetBookText_NoSuchPtProjectKnown()
        {
            string ruthBookUsfm = "\\id RUT - ProjectNameHere\n" +
                "\\c 1\n" +
                "\\v 1 Verse 1 here.\n" +
                "\\v 2 Verse 2 here.";

            MockScrText paratextProject = new MockScrText();
            paratextProject.Data.Add("RUT", ruthBookUsfm);
            var env = new TestEnvironment();
            string ptProjectId = "paratext_" + env.Project01;
            UserSecret user01Secret = env.MakeUserSecret(env.User01);
            IInternetSharedRepositorySource mockSource = env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
            env.MockedScrTextCollectionRunner.FindById(ptProjectId).Returns(i => null);

            // SUT
            Assert.ThrowsAsync<DataNotFoundException>(() => env.Service.GetBookTextAsync(user01Secret, ptProjectId, 8));
            // Should have tried to clone the needed repo.
            mockSource.Received(1).Pull(Arg.Any<string>(), Arg.Any<SharedRepository>());
            // Should have tried twice to access project.
            env.MockedScrTextCollectionRunner.Received(2).FindById(Arg.Any<string>());
        }

        [Test]
        public async Task GetBookText_ProjectNotYetCloned()
        {
            // PT project isn't cloned yet.
            // It gets cloned.
            // And so GetBookText then returns data.

            string ruthBookUsfm = "\\id RUT - ProjectNameHere\n" +
                "\\c 1\n" +
                "\\v 1 Verse 1 here.\n" +
                "\\v 2 Verse 2 here.";
            string ruthBookUsx = "<usx version=\"3.0\">\r\n  <book code=\"RUT\" style=\"id\">- ProjectNameHere</book>\r\n  <chapter number=\"1\" style=\"c\" />\r\n  <verse number=\"1\" style=\"v\" />Verse 1 here. <verse number=\"2\" style=\"v\" />Verse 2 here.</usx>";

            MockScrText paratextProject = new MockScrText();
            paratextProject.Data.Add("RUT", ruthBookUsfm);
            var env = new TestEnvironment();
            string ptProjectId = "paratext_" + env.Project01;
            UserSecret user01Secret = env.MakeUserSecret(env.User01);
            IInternetSharedRepositorySource mockSource = env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
            // FindById fails the first time, and then succeeds the second time after the pt project repo is cloned.
            env.MockedScrTextCollectionRunner.FindById(ptProjectId).Returns(null, paratextProject);

            // SUT
            string result = await env.Service.GetBookTextAsync(user01Secret, ptProjectId, 8);
            Assert.That(result, Is.EqualTo(ruthBookUsx));
            // Should have tried to clone the needed repo.
            mockSource.Received(1).Pull(Arg.Any<string>(), Arg.Any<SharedRepository>());
            // Should have tried twice to access project.
            env.MockedScrTextCollectionRunner.Received(2).FindById(Arg.Any<string>());
        }

        [Test]
        public async Task GetNotes_RetrievesNotes()
        {
            string paratextProjectId = "ptId123";
            int ruthBookNum = 8;
            var env = new TestEnvironment();
            _manager.AddComment(new Paratext.Data.ProjectComments.Comment { Thread = "Answer_dataId0123", VerseRefStr = "RUT 1:1" });
            env.MockedScrTextCollectionRunner.FindById(paratextProjectId).Returns(_paratextProject);
            string notes = env.Service.GetNotes(paratextProjectId, ruthBookNum);
            Assert.True(notes.StartsWith("<notes version=\"1.1\">\n  <thread id=\"Answer_dataId0123\">"));
        }

        [Test]
        public async Task PutNotes_AddNewComment()
        {
            string paratextProjectId = "ptId123";
            var env = new TestEnvironment();
            env.MockedScrTextCollectionRunner.FindById(paratextProjectId).Returns(_paratextProject);

            // Add new comment
            string threadId = "Answer_0123";
            string content = "Content for comment to update.";
            string verseRef = "RUT 1:1";
            string updateNotesString = env.GetUpdateNotesString(threadId, env.User01, content, verseRef);
            env.Service.PutNotes(paratextProjectId, updateNotesString);

            CommentThread thread = _manager.FindThread(threadId);
            Assert.That(thread.Comments.Count, Is.EqualTo(1));
            var comment = thread.Comments.First();
            Assert.That(comment.VerseRefStr, Is.EqualTo(verseRef));
            Assert.That(comment.User, Is.EqualTo(env.User01));
            Assert.That(comment.Contents.InnerText, Is.EqualTo(content));

            // Edit a comment
            content = "Edited: Content for comment to update.";
            updateNotesString = env.GetUpdateNotesString(threadId, env.User01, content, verseRef);
            env.Service.PutNotes(paratextProjectId, updateNotesString);

            Assert.That(thread.Comments.Count, Is.EqualTo(1));
            comment = thread.Comments.First();
            Assert.That(comment.Contents.InnerText, Is.EqualTo(content));

            // Delete a comment
            updateNotesString = env.GetUpdateNotesString(threadId, env.User01, content, verseRef, true);
            env.Service.PutNotes(paratextProjectId, updateNotesString);

            Assert.That(thread.Comments.Count, Is.EqualTo(1));
            comment = thread.Comments.First();
            Assert.That(comment.Deleted, Is.True, "Comment should be marked deleted");
        }

        private class TestEnvironment
        {
            public readonly string Project01 = "project01";
            public readonly string Project02 = "project02";
            public readonly string Project03 = "project03";
            public readonly string User01 = "user01";
            public readonly string User02 = "user02";
            public readonly string User03 = "user03";

            public IWebHostEnvironment MockWebHostEnvironment;
            public IOptions<ParatextOptions> MockParatextOptions;
            public IRepository<UserSecret> MockRepository;
            public SFMemoryRealtimeService RealtimeService;
            public IExceptionHandler MockExceptionHandler;
            public IOptions<SiteOptions> MockSiteOptions;
            public IFileSystemService MockFileSystemService;
            public IScrTextCollectionWrapper MockedScrTextCollectionRunner;


            public ParatextService Service;

            public readonly UserSecret userSecret;

            public TestEnvironment()
            {
                MockWebHostEnvironment = Substitute.For<IWebHostEnvironment>();
                MockParatextOptions = Substitute.For<IOptions<ParatextOptions>>();
                MockRepository = Substitute.For<IRepository<UserSecret>>();
                MockExceptionHandler = Substitute.For<IExceptionHandler>();
                MockSiteOptions = Substitute.For<IOptions<SiteOptions>>();
                MockFileSystemService = Substitute.For<IFileSystemService>();
                MockedScrTextCollectionRunner = Substitute.For<IScrTextCollectionWrapper>();
                // MockInternetSharedRepositorySource = Substitute.For<IInternetSharedRepositorySource>();

                RealtimeService = new SFMemoryRealtimeService();

                //Mock=Substitute.For<>();
                //Mock=Substitute.For<>();
                Service = new ParatextService(MockWebHostEnvironment, MockParatextOptions, MockRepository, RealtimeService, MockExceptionHandler, MockSiteOptions, MockFileSystemService);
                Service._scrTextCollectionWrapper = MockedScrTextCollectionRunner;
                Service.SyncDir = "/tmp";

                RegistryU.Implementation = new DotNetCoreRegistry();
                AddProjectRepository();



                // Set Hg.Default to a no-op.
                var hgExe = "/bin/true";
                var hgMerge = "/dev/null";
                Hg.Default = new Hg(hgExe, hgMerge, Service.SyncDir);
            }

            public UserSecret MakeUserSecret(string userSecretId)
            {
                var userSecret = new UserSecret();
                userSecret.Id = userSecretId;
                var ptToken = new Tokens
                {
                    AccessToken = "access_token_1234",
                    RefreshToken = "refresh_token_1234"
                };
                userSecret.ParatextTokens = ptToken;
                return userSecret;
            }

            public IInternetSharedRepositorySource SetSharedRepositorySource(UserSecret userSecret, UserRoles userRoleOnAllThePtProjects)
            {
                PermissionManager sourceUsers = Substitute.For<PermissionManager>();
                sourceUsers.GetRole(Arg.Any<string>()).Returns(userRoleOnAllThePtProjects);
                IInternetSharedRepositorySource mockSource = Substitute.For<IInternetSharedRepositorySource>();
                SharedRepository repo1 = new SharedRepository
                {
                    SendReceiveId = "paratext_" + Project01,
                    ScrTextName = "P01",
                    SourceUsers = sourceUsers
                };
                SharedRepository repo2 = new SharedRepository
                {
                    SendReceiveId = "paratext_" + Project02,
                    ScrTextName = "P02",
                    SourceUsers = sourceUsers
                };
                SharedRepository repo3 = new SharedRepository
                {
                    SendReceiveId = "paratext_" + Project03,
                    ScrTextName = "P03",
                    SourceUsers = sourceUsers
                };
                mockSource.GetRepositories().Returns(new List<SharedRepository> { repo1, repo3, repo2 });
                Service._internetSharedRepositorySource[userSecret.Id] = mockSource;
                return mockSource;
            }

            public void AddProjectRepository()
            {
                RealtimeService.AddRepository("sf_projects", OTType.Json0, new MemoryRepository<SFProject>(
                    new[]
                    {
                        new SFProject
                        {
                            Id = "sf_id_"+Project01,
                            ParatextId = "paratext_" + Project01,
                            Name = "project01",
                            ShortName = "P01",
                            WritingSystem = new WritingSystem
                            {
                                Tag = "writingsystem_tag"
                            },
                            TranslateConfig = new TranslateConfig
                            {
                                TranslationSuggestionsEnabled = true,
                                Source = new TranslateSource
                                {
                                    ParatextId = "paratextId",
                                    Name = "Source",
                                    ShortName = "SRC",
                                    WritingSystem = new WritingSystem
                                    {
                                        Tag = "qaa"
                                    }
                                }
                            },
                            CheckingConfig = new CheckingConfig
                            {
                                ShareEnabled = false
                            },
                            UserRoles = new Dictionary<string, string>
                            {
                                { User01, SFProjectRole.Administrator },
                                { User02, SFProjectRole.CommunityChecker }
                            },
                            Texts =
                            {
                                new TextInfo
                                {
                                    BookNum = 40,
                                    Chapters = { new Chapter { Number = 1, LastVerse = 3, IsValid = true } }
                                },
                                new TextInfo
                                {
                                    BookNum = 41,
                                    Chapters =
                                    {
                                        new Chapter { Number = 1, LastVerse = 3, IsValid = true },
                                        new Chapter { Number = 2, LastVerse = 3, IsValid = true }
                                    }
                                }
                            }
                        },
                    }));
            }

            public string GetUpdateNotesString(string threadId, string user, string content, string verseRef = "MAT 1:1", bool delete = false)
            {
                XElement notesElem = new XElement("notes", new XAttribute("version", "1.1"));
                XElement threadElem = new XElement("thread", new XAttribute("id", threadId),
                    new XElement("selection",
                        new XAttribute("verseRef", "RUT 1:1"),
                        new XAttribute("startPos", 0),
                        new XAttribute("selectedText", "")
                    ));
                XElement commentElem = new XElement("comment", new XAttribute("user", user));
                DateTime date = new DateTime();
                commentElem.Add(new XAttribute("date", date.ToString("o")));
                XElement contentElem = new XElement("content");
                contentElem.Add(content);
                commentElem.Add(contentElem);
                if (delete)
                {
                    commentElem.SetAttributeValue("deleted", true);
                    commentElem.SetAttributeValue("versionNbr", null);
                }
                threadElem.Add(commentElem);
                notesElem.Add(threadElem);
                return notesElem.ToString();
            }
        }
    }
}
