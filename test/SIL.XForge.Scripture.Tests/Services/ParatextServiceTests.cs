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
using SIL.XForge.Realtime.RichText;
using Newtonsoft.Json.Linq;

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
            Assert.That(repos.Single(project => project.ParatextId == "paratext_" + env.Project01).ExpressiveToString(),
                Is.EqualTo(expectedProject01.ExpressiveToString()));

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

            // Check resulting IsConnectable and IsConnected values across various scenarios of SF project existing,
            // SF user being a member of the SF project, and PT user being an admin on PT project.

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
                Assert.That((await env.RealtimeService.GetRepository<SFProject>().GetAllAsync())
                    .Any(sfProject => sfProject.ParatextId == testCase.paratextProjectId),
                    Is.EqualTo(testCase.sfProjectExists), "not set up - whether sf project exists or not");
                if (testCase.sfProjectExists)
                {
                    Assert.That((await env.RealtimeService.GetRepository<SFProject>().GetAllAsync())
                        .Single(sfProject => sfProject.ParatextId == testCase.paratextProjectId).UserRoles
                        .ContainsKey(testCase.sfUserId), Is.EqualTo(testCase.sfUserIsOnSfProject),
                        "not set up - whether user is on existing sf project or not");
                }
                Assert.That(env.Service._internetSharedRepositorySource[testCase.sfUserId].GetRepositories()
                    .FirstOrDefault(sharedRepository => sharedRepository.SendReceiveId == testCase.paratextProjectId)
                    .SourceUsers.GetRole(testCase.ptUsername) == UserRoles.Administrator,
                    Is.EqualTo(testCase.ptUserIsAdminOnPtProject),
                    "not set up - whether pt user is an admin on pt project");

                // SUT
                ParatextProject resultingProjectToExamine = (await env.Service.GetProjectsAsync(testCase.userSecret))
                    .Single(project => project.ParatextId == testCase.paratextProjectId);

                // Assert expectations.
                Assert.That(resultingProjectToExamine.IsConnected, Is.EqualTo(testCase.isConnected), testCase.reason1);
                Assert.That(resultingProjectToExamine.IsConnectable,
                    Is.EqualTo(testCase.isConnectable), testCase.reason2);
            }
        }

        [Test]
        public void GetBooks_ReturnCorrectNumberOfBooks()
        {
            var env = new TestEnvironment();
            MockScrText paratextProject = new MockScrText();
            // Books 1 thru 3.
            paratextProject.Settings.BooksPresentSet = new BookSet(1, 3);
            string paratextProjectId = "ptId123";
            env.MockedScrTextCollectionWrapper.FindById(paratextProjectId).Returns(paratextProject);

            IReadOnlyList<int> result = env.Service.GetBookList(paratextProjectId);
            Assert.That(result.Count(), Is.EqualTo(3));
            Assert.That(result, Is.EquivalentTo(new[] { 1, 2, 3 }));
        }

        [Test]
        public async Task GetBookText_Works()
        {
            string paratextProjectId = "ptId123";
            string ruthBookUsx = "<usx version=\"3.0\">\r\n  <book code=\"RUT\" style=\"id\">- ProjectNameHere" +
                "</book>\r\n  <chapter number=\"1\" style=\"c\" />\r\n  <verse number=\"1\" style=\"v\" />" +
                "Verse 1 here. <verse number=\"2\" style=\"v\" />Verse 2 here.</usx>";

            var env = new TestEnvironment();
            env.MockedScrTextCollectionWrapper.FindById(paratextProjectId).Returns(_paratextProject);

            // SUT
            string result = await env.Service.GetBookTextAsync(null, paratextProjectId, 8);
            Assert.That(result, Is.EqualTo(ruthBookUsx));
        }

        [Test]
        public void GetBookText_NoSuchPtProjectKnown()
        {
            var env = new TestEnvironment();
            string ptProjectId = "paratext_" + env.Project01;
            UserSecret user01Secret = env.MakeUserSecret(env.User01);
            IInternetSharedRepositorySource mockSource =
                env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
            env.MockedScrTextCollectionWrapper.FindById(ptProjectId).Returns(i => null);

            // SUT
            Assert.ThrowsAsync<DataNotFoundException>(() => env.Service.GetBookTextAsync(user01Secret, ptProjectId, 8));
            // Should have tried to clone the needed repo.
            mockSource.Received(1).Pull(Arg.Any<string>(), Arg.Any<SharedRepository>());
            // Should have tried twice to access project.
            env.MockedScrTextCollectionWrapper.Received(2).FindById(Arg.Any<string>());
        }

        [Test]
        public void PutBookText_TextEdited_BookTextIsUpdated()
        {
            string paratextProjectId = "ptId123";
            var env = new TestEnvironment();
            env.MockedScrTextCollectionWrapper.FindById(paratextProjectId).Returns(_paratextProject);

            int ruthBookNum = 8;
            string ruthBookUsx = "<usx version=\"3.0\">\r\n  <book code=\"RUT\" style=\"id\">- ProjectNameHere" +
                "</book>\r\n  <chapter number=\"1\" style=\"c\" />\r\n  <verse number=\"1\" style=\"v\" />" +
                "Verse 1 here. <verse number=\"2\" style=\"v\" />Verse 2 here.</usx>";

            JToken token1 = JToken.Parse("{\"insert\": { \"chapter\": { \"number\": \"1\", \"style\": \"c\" } } }");
            JToken token2 = JToken.Parse("{\"insert\": { \"verse\": { \"number\": \"1\", \"style\": \"v\" } } }");
            JToken token3 =
                JToken.Parse("{\"insert\": \"Verse 1 here. \", \"attributes\": { \"segment\": \"verse_1_1\" } }");
            JToken token4 = JToken.Parse("{\"insert\": { \"verse\": { \"number\": \"2\", \"style\": \"v\" } } }");
            JToken token5 =
                JToken.Parse("{\"insert\": \"Verse 2 here. THIS PART IS EDITED!\"," +
                "\"attributes\": { \"segment\": \"verse_1_2\" } }");

            TextData data = new TextData(new Delta(new[] { token1, token2, token3, token4, token5 }));
            XDocument oldDocUsx = XDocument.Parse(ruthBookUsx);
            DeltaUsxMapper mapper = new DeltaUsxMapper();
            var newDocUsx = mapper.ToUsx(oldDocUsx, new List<ChapterDelta> { new ChapterDelta(1, 2, true, data) });
            env.Service.PutBookText(paratextProjectId, ruthBookNum, newDocUsx.Root.ToString());
            _paratextProject.FileManager.Received(1)
                .WriteFileCreatingBackup(Arg.Any<string>(), Arg.Any<Action<string>>());
        }

        [Test]
        public async Task GetBookText_ProjectNotYetCloned()
        {
            // PT project isn't cloned yet.
            // It gets cloned.
            // And so GetBookText then returns data.
            string ruthBookUsx = "<usx version=\"3.0\">\r\n  <book code=\"RUT\" style=\"id\">- ProjectNameHere" +
                "</book>\r\n  <chapter number=\"1\" style=\"c\" />\r\n  <verse number=\"1\" style=\"v\" />" +
                "Verse 1 here. <verse number=\"2\" style=\"v\" />Verse 2 here.</usx>";

            var env = new TestEnvironment();
            string ptProjectId = "paratext_" + env.Project01;
            UserSecret user01Secret = env.MakeUserSecret(env.User01);
            IInternetSharedRepositorySource mockSource =
                env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
            // FindById fails the first time, and then succeeds the second time after the pt project repo is cloned.
            env.MockedScrTextCollectionWrapper.FindById(ptProjectId).Returns(null, _paratextProject);

            // SUT
            string result = await env.Service.GetBookTextAsync(user01Secret, ptProjectId, 8);
            Assert.That(result, Is.EqualTo(ruthBookUsx));
            // Should have tried to clone the needed repo.
            mockSource.Received(1).Pull(Arg.Any<string>(), Arg.Any<SharedRepository>());
            // Should have tried twice to access project.
            env.MockedScrTextCollectionWrapper.Received(2).FindById(Arg.Any<string>());
            env.MockedScrTextCollectionWrapper.Received(1).RefreshScrTexts();
        }

        [Test]
        public void GetNotes_RetrievesNotes()
        {
            string paratextProjectId = "ptId123";
            int ruthBookNum = 8;
            var env = new TestEnvironment();
            _manager.AddComment(
                new Paratext.Data.ProjectComments.Comment { Thread = "Answer_dataId0123", VerseRefStr = "RUT 1:1" });
            env.MockedScrTextCollectionWrapper.FindById(paratextProjectId).Returns(_paratextProject);
            string notes = env.Service.GetNotes(paratextProjectId, ruthBookNum);
            Assert.True(notes.StartsWith("<notes version=\"1.1\">\n  <thread id=\"Answer_dataId0123\">"));
        }

        [Test]
        public void PutNotes_AddEditDeleteComment_ThreadCorrectlyUpdated()
        {
            string paratextProjectId = "ptId123";
            var env = new TestEnvironment();
            UserSecret userSecret = env.MakeUserSecret(env.User01);
            env.MockedScrTextCollectionWrapper.FindById(paratextProjectId).Returns(_paratextProject);

            // Add new comment
            string threadId = "Answer_0123";
            string content = "Content for comment to update.";
            string verseRef = "RUT 1:1";
            string updateNotesString = env.GetUpdateNotesString(threadId, env.User01, content, verseRef);
            env.Service.PutNotes(userSecret, paratextProjectId, updateNotesString);

            CommentThread thread = _manager.FindThread(threadId);
            Assert.That(thread.Comments.Count, Is.EqualTo(1));
            var comment = thread.Comments.First();
            Assert.That(comment.VerseRefStr, Is.EqualTo(verseRef));
            Assert.That(comment.User, Is.EqualTo(env.User01));
            Assert.That(comment.Contents.InnerText, Is.EqualTo(content));

            // Edit a comment
            content = "Edited: Content for comment to update.";
            updateNotesString = env.GetUpdateNotesString(threadId, env.User01, content, verseRef);
            env.Service.PutNotes(userSecret, paratextProjectId, updateNotesString);

            Assert.That(thread.Comments.Count, Is.EqualTo(1));
            comment = thread.Comments.First();
            Assert.That(comment.Contents.InnerText, Is.EqualTo(content));

            // Delete a comment
            updateNotesString = env.GetUpdateNotesString(threadId, env.User01, content, verseRef, true);
            env.Service.PutNotes(userSecret, paratextProjectId, updateNotesString);

            Assert.That(thread.Comments.Count, Is.EqualTo(1));
            comment = thread.Comments.First();
            Assert.That(comment.Deleted, Is.True, "Comment should be marked deleted");
        }

        [Test]
        public void SendReceiveAsync_BadArguments()
        {
            var env = new TestEnvironment();
            UserSecret user01Secret = env.MakeUserSecret(env.User01);
            Assert.ThrowsAsync<ArgumentNullException>(() => env.Service.SendReceiveAsync(null, null));
            Assert.ThrowsAsync<ArgumentNullException>(() => env.Service.SendReceiveAsync(null,
                new string[] { "paratext_" + env.Project01 }));
            Assert.ThrowsAsync<ArgumentNullException>(() => env.Service.SendReceiveAsync(user01Secret, null));
        }

        [Test]
        public async Task SendReceiveAsync_UserIsAdministrator_Succeeds()
        {
            var env = new TestEnvironment();
            UserSecret user01Secret = env.MakeUserSecret(env.User01);
            IInternetSharedRepositorySource mockSource =
                env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
            env.MockedSharingLogicWrapper.CreateSharedProject(Arg.Any<string>(), Arg.Any<string>(),
                Arg.Any<SharedRepositorySource>(), Arg.Any<IEnumerable<SharedRepository>>())
                    .Returns(callInfo => new SharedProject() { SendReceiveId = callInfo.ArgAt<string>(0) });
            env.MockedSharingLogicWrapper.ShareChanges(Arg.Any<List<SharedProject>>(),
                Arg.Any<SharedRepositorySource>(), out Arg.Any<List<SendReceiveResult>>(),
                Arg.Any<List<SharedProject>>()).Returns(true);

            // Have the HandleErrors method run its first argument, which would be the ShareChanges() call. This helps
            // check that the implementation code is calling ShareChanges().
            env.MockedSharingLogicWrapper.HandleErrors(Arg.Any<Action>(),
                Arg.Any<bool>()).Returns((callInfo) => { callInfo.Arg<Action>()(); return true; });
            string ptProjectId1 = "paratext_" + env.Project01;
            string ptProjectId2 = "paratext_" + env.Project02;
            SyncProgressDisplay progressDisplay = Substitute.For<SyncProgressDisplay>();

            // SUT 1
            await env.Service.SendReceiveAsync(user01Secret, new string[] { ptProjectId1, ptProjectId2 },
                progressDisplay);
            env.MockedSharingLogicWrapper.Received(1).ShareChanges(Arg.Is<List<SharedProject>>(list =>
                list.Count == 2 && list[0].SendReceiveId == ptProjectId1), Arg.Any<SharedRepositorySource>(),
                out Arg.Any<List<SendReceiveResult>>(),
                Arg.Is<List<SharedProject>>(list => list.Count == 2 && list[0].SendReceiveId == ptProjectId1));
            progressDisplay.ReceivedWithAnyArgs().SetProgressValue(default);
            env.MockedSharingLogicWrapper.ClearReceivedCalls();
            // Passing a PT project Id for a project the user does not have access to fails early without doing S/R
            // SUT 2
            ArgumentException resultingException = Assert.ThrowsAsync<ArgumentException>(() =>
                env.Service.SendReceiveAsync(user01Secret, new string[] {
                    ptProjectId1, "unknownPtProjectId8", ptProjectId2, "unknownPtProjectId9" }));
            Assert.That(resultingException.Message, Does.Contain("unknownPtProjectId8").And
                .Contain("unknownPtProjectId8"));
            env.MockedSharingLogicWrapper.DidNotReceive().ShareChanges(default, Arg.Any<SharedRepositorySource>(),
                out Arg.Any<List<SendReceiveResult>>(), default);
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
            public IScrTextCollectionWrapper MockedScrTextCollectionWrapper;
            public ISharingLogicWrapper MockedSharingLogicWrapper;
            public ParatextService Service;

            public TestEnvironment()
            {
                MockWebHostEnvironment = Substitute.For<IWebHostEnvironment>();
                MockParatextOptions = Substitute.For<IOptions<ParatextOptions>>();
                MockRepository = Substitute.For<IRepository<UserSecret>>();
                MockExceptionHandler = Substitute.For<IExceptionHandler>();
                MockSiteOptions = Substitute.For<IOptions<SiteOptions>>();
                MockFileSystemService = Substitute.For<IFileSystemService>();
                MockedScrTextCollectionWrapper = Substitute.For<IScrTextCollectionWrapper>();
                MockedSharingLogicWrapper = Substitute.For<ISharingLogicWrapper>();

                RealtimeService = new SFMemoryRealtimeService();

                Service = new ParatextService(MockWebHostEnvironment, MockParatextOptions, MockRepository,
                    RealtimeService, MockExceptionHandler, MockSiteOptions, MockFileSystemService);
                Service._scrTextCollectionWrapper = MockedScrTextCollectionWrapper;
                Service._sharingLogicWrapper = MockedSharingLogicWrapper;
                Service._jwtTokenHelper = new MockJwtTokenHelper(User01);
                Service.SyncDir = "/tmp";

                RegistryU.Implementation = new DotNetCoreRegistry();
                AddProjectRepository();

                // Set Hg.Default to a no-op.
                var hgExe = "/bin/true";
                var hgMerge = "/dev/null";
                Hg.Default = new Hg(hgExe, hgMerge, Service.SyncDir);
            }

            public UserSecret MakeUserSecret(string userSecretId, string username = "testUsername")
            {
                var userSecret = new UserSecret();
                userSecret.Id = userSecretId;
                var ptToken = new Tokens
                {
                    AccessToken = "access_token_1234",
                    RefreshToken = "refresh_token_1234"
                };
                userSecret.ParatextTokens = ptToken;
                Service._jwtTokenHelper = new MockJwtTokenHelper(username);
                return userSecret;
            }

            public IInternetSharedRepositorySource SetSharedRepositorySource(UserSecret userSecret,
                UserRoles userRoleOnAllThePtProjects)
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

            public string GetUpdateNotesString(string threadId, string user, string content,
                string verseRef = "MAT 1:1", bool delete = false)
            {
                XElement notesElem = new XElement("notes", new XAttribute("version", "1.1"));
                XElement threadElem = new XElement("thread", new XAttribute("id", threadId),
                    new XElement("selection",
                        new XAttribute("verseRef", verseRef),
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
