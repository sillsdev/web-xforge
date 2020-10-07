using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Newtonsoft.Json.Linq;
using NSubstitute;
using NUnit.Framework;
using Paratext.Data;
using Paratext.Data.ProjectComments;
using Paratext.Data.RegistryServerAccess;
using Paratext.Data.Repository;
using Paratext.Data.Users;
using PtxUtils;
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
    public class ParatextServiceTests
    {
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
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01);
            env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);

            // SUT
            IEnumerable<ParatextProject> repos = await env.Service.GetProjectsAsync(user01Secret);

            // Right number of repos returned.
            Assert.That(repos.Count(), Is.EqualTo(3));

            // Repos returned are the ones we expect.
            // TODO Make PT repos in data that should not be returned.
            foreach (string projectName in new string[] { env.Project01, env.Project03, env.Project02 })
            {
                Assert.That(repos.Single(project => project.ParatextId == "paratext_" + projectName), Is.Not.Null);
            }

            // Properties of one of the returned repos have the correct values.
            ParatextProject expectedProject01 = new ParatextProject
            {
                ParatextId = "paratext_" + env.Project01,
                Name = "Full Name " + env.Project01,
                ShortName = "P01",
                LanguageTag = "writingsystem_tag",
                ProjectId = "sf_id_" + env.Project01,
                // Not connectable since sf project exists and sf user is on sf project.
                IsConnectable = false,
                // Is connected since is in SF database and user is on project
                IsConnected = true
            };
            Assert.That(repos.Single(project => project.ParatextId == "paratext_" + env.Project01).ToString(),
                Is.EqualTo(expectedProject01.ToString()));

            // Repos are returned in alphabetical order by paratext project name.
            List<string> repoList = repos.Select(repo => repo.Name).ToList();
            Assert.That(StringComparer.InvariantCultureIgnoreCase.Compare(repoList[0], repoList[1]), Is.LessThan(0));
            Assert.That(StringComparer.InvariantCultureIgnoreCase.Compare(repoList[1], repoList[2]), Is.LessThan(0));
        }

        [Test]
        public async Task GetProjectsAsync_ProjectNotOnSF_RetrievesProjectFullName()
        {
            var env = new TestEnvironment();
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01);
            env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
            IEnumerable<ParatextProject> projects = await env.Service.GetProjectsAsync(user01Secret);

            ParatextProject project02 = projects.Single(p => p.ParatextId == "paratext_" + env.Project02);
            Assert.That(project02.Name, Is.EqualTo("Full Name " + env.Project02));
        }

        [Test]
        public async Task GetProjectsAsync_ConnectedConnectable()
        {
            var env = new TestEnvironment();
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01);
            env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
            UserSecret user03Secret = env.MakeUserSecret(env.User03, "User 03");
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
                Assert.That(env.MockInternetSharedRepositorySourceProvider.GetSource(testCase.userSecret,
                    string.Empty, string.Empty, string.Empty).GetRepositories()
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
            var associatedPtUser = new SFParatextUser(env.Username01);
            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
            UserSecret userSecret = env.MakeUserSecret(env.User01, env.Username01);

            // Books 1 thru 3.
            env.ProjectScrText.Settings.BooksPresentSet = new BookSet(1, 3);

            IReadOnlyList<int> result = env.Service.GetBookList(userSecret, ptProjectId, Models.TextType.Target);
            Assert.That(result.Count(), Is.EqualTo(3));
            Assert.That(result, Is.EquivalentTo(new[] { 1, 2, 3 }));
        }

        [Test]
        public void GetBookText_Works()
        {
            string ruthBookUsx = "<usx version=\"3.0\">\r\n  <book code=\"RUT\" style=\"id\">- ProjectNameHere" +
                "</book>\r\n  <chapter number=\"1\" style=\"c\" />\r\n  <verse number=\"1\" style=\"v\" />" +
                "Verse 1 here. <verse number=\"2\" style=\"v\" />Verse 2 here.</usx>";

            var env = new TestEnvironment();
            var associatedPtUser = new SFParatextUser(env.Username01);
            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
            env.MakeUserSecret(env.User01, env.Username01);

            // SUT
            string result = env.Service.GetBookText(null, ptProjectId, 8, Models.TextType.Target);
            Assert.That(result, Is.EqualTo(ruthBookUsx));
        }

        [Test]
        public void GetBookText_NoSuchPtProjectKnown()
        {
            var env = new TestEnvironment();
            string ptProjectId = "paratext_" + env.Project01;
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01);
            IInternetSharedRepositorySource mockSource =
                env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
            env.MockScrTextCollection.FindById(env.Username01, ptProjectId, Models.TextType.Target).Returns(i => null);

            // SUT
            Assert.Throws<DataNotFoundException>(() => env.Service.GetBookText(user01Secret, ptProjectId, 8,
                Models.TextType.Target));
            env.MockScrTextCollection.Received(1).FindById(env.Username01, ptProjectId, Models.TextType.Target);
        }

        [Test]
        public void PutBookText_TextEdited_BookTextIsUpdated()
        {
            var env = new TestEnvironment();
            var associatedPtUser = new SFParatextUser(env.Username01);
            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
            UserSecret userSecret = env.MakeUserSecret(env.User01, env.Username01);

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
            DeltaUsxMapper mapper = new DeltaUsxMapper(new TestGuidService(), Substitute.For<ILogger<DeltaUsxMapper>>(),
                Substitute.For<IExceptionHandler>());
            var newDocUsx = mapper.ToUsx(oldDocUsx, new List<ChapterDelta> { new ChapterDelta(1, 2, true, data) });
            env.Service.PutBookText(userSecret, ptProjectId, ruthBookNum, newDocUsx.Root.ToString());
            env.ProjectScrText.FileManager.Received(1)
                .WriteFileCreatingBackup(Arg.Any<string>(), Arg.Any<Action<string>>());

            // PT username is not written to server logs
            Assert.That(env.MockLogger.Messages.Any((string message) => message.Contains(env.Username01)), Is.False);
        }

        [Test]
        public void GetNotes_RetrievesNotes()
        {
            int ruthBookNum = 8;
            var env = new TestEnvironment();
            var associatedPtUser = new SFParatextUser(env.Username01);
            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
            UserSecret userSecret = env.MakeUserSecret(env.User01, env.Username01);
            env.ProjectCommentManager.AddComment(
                new Paratext.Data.ProjectComments.Comment(associatedPtUser) { Thread = "Answer_dataId0123", VerseRefStr = "RUT 1:1" });
            string notes = env.Service.GetNotes(userSecret, ptProjectId, ruthBookNum);
            string expected = $"<notes version=\"1.1\">{Environment.NewLine}  <thread id=\"Answer_dataId0123\">";
            Assert.True(notes.StartsWith(expected));
        }

        [Test]
        public void PutNotes_AddEditDeleteComment_ThreadCorrectlyUpdated()
        {
            var env = new TestEnvironment();
            var associatedPtUser = new SFParatextUser(env.Username01);
            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
            UserSecret userSecret = env.MakeUserSecret(env.User01, env.Username01);

            // Add new comment
            string threadId = "Answer_0123";
            string content = "Content for comment to update.";
            string verseRef = "RUT 1:1";
            string updateNotesString = env.GetUpdateNotesString(threadId, env.User01, content, verseRef);
            env.Service.PutNotes(userSecret, ptProjectId, updateNotesString);

            CommentThread thread = env.ProjectCommentManager.FindThread(threadId);
            Assert.That(thread.Comments.Count, Is.EqualTo(1));
            var comment = thread.Comments.First();
            Assert.That(comment.VerseRefStr, Is.EqualTo(verseRef));
            Assert.That(comment.User, Is.EqualTo(env.User01));
            Assert.That(comment.Contents.InnerText, Is.EqualTo(content));

            // Edit a comment
            content = "Edited: Content for comment to update.";
            updateNotesString = env.GetUpdateNotesString(threadId, env.User01, content, verseRef);
            env.Service.PutNotes(userSecret, ptProjectId, updateNotesString);

            Assert.That(thread.Comments.Count, Is.EqualTo(1));
            comment = thread.Comments.First();
            Assert.That(comment.Contents.InnerText, Is.EqualTo(content));

            // Delete a comment
            updateNotesString = env.GetUpdateNotesString(threadId, env.User01, content, verseRef, true);
            env.Service.PutNotes(userSecret, ptProjectId, updateNotesString);

            Assert.That(thread.Comments.Count, Is.EqualTo(1));
            comment = thread.Comments.First();
            Assert.That(comment.Deleted, Is.True, "Comment should be marked deleted");

            // PT username is not written to server logs
            Assert.That(env.MockLogger.Messages.Any((string message) => message.Contains(env.Username01)), Is.False);
        }

        [Test]
        public void SendReceiveAsync_BadArguments()
        {
            var env = new TestEnvironment();
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01);
            Assert.ThrowsAsync<ArgumentNullException>(() => env.Service.SendReceiveAsync(null, null, null));
            Assert.ThrowsAsync<ArgumentNullException>(() => env.Service.SendReceiveAsync(null,
                "paratext_" + env.Project01, null));
            Assert.ThrowsAsync<ArgumentNullException>(() => env.Service.SendReceiveAsync(user01Secret, null, null));
        }

        [Test]
        public void SendReceiveAsync_ShareChangesErrors_Throws()
        {
            var env = new TestEnvironment();
            var associatedPtUser = new SFParatextUser(env.Username01);
            string projectId = env.SetupProject(env.Project01, associatedPtUser);
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01);

            IInternetSharedRepositorySource mockSource =
                env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
            env.SetupSuccessfulSendReceive();
            // Setup share changes to be unsuccessful
            env.MockSharingLogicWrapper.ShareChanges(Arg.Any<List<SharedProject>>(), Arg.Any<SharedRepositorySource>(),
                out Arg.Any<List<SendReceiveResult>>(), Arg.Any<List<SharedProject>>()).Returns(false);

            InvalidOperationException ex = Assert.ThrowsAsync<InvalidOperationException>(() =>
                env.Service.SendReceiveAsync(user01Secret, projectId, null));
            Assert.That(ex.Message, Does.Contain("Failed: Errors occurred"));

            // Check exception is thrown if errors occurred, even if share changes succeeded
            env.MockSharingLogicWrapper.HandleErrors(Arg.Any<Action>()).Returns(false);
            ex = Assert.ThrowsAsync<InvalidOperationException>(() =>
                env.Service.SendReceiveAsync(user01Secret, projectId, null));
            Assert.That(ex.Message, Does.Contain("Failed: Errors occurred"));
        }

        [Test]
        public async Task SendReceiveAsync_UserIsAdministrator_Succeeds()
        {
            var env = new TestEnvironment();
            var associatedPtUser = new SFParatextUser(env.Username01);
            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01);
            IInternetSharedRepositorySource mockSource =
                env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
            env.SetupSuccessfulSendReceive();

            // SUT 1
            await env.Service.SendReceiveAsync(user01Secret, ptProjectId, null);
            env.MockSharingLogicWrapper.Received(1).ShareChanges(Arg.Is<List<SharedProject>>(list =>
                list.Count == 1 && list[0].SendReceiveId == ptProjectId), Arg.Any<SharedRepositorySource>(),
                out Arg.Any<List<SendReceiveResult>>(),
                Arg.Is<List<SharedProject>>(list => list.Count == 1 && list[0].SendReceiveId == ptProjectId));
            mockSource.DidNotReceive().Pull(Arg.Any<string>(), Arg.Any<SharedRepository>());
            env.MockSharingLogicWrapper.ClearReceivedCalls();

            // Passing a PT project Id for a project the user does not have access to fails early without doing S/R
            // SUT 2
            ArgumentException resultingException = Assert.ThrowsAsync<ArgumentException>(() =>
                env.Service.SendReceiveAsync(user01Secret, ptProjectId, "unknownPtProjectId8"));
            Assert.That(resultingException.Message, Does.Contain("unknownPtProjectId8"));
            env.MockSharingLogicWrapper.DidNotReceive().ShareChanges(default, Arg.Any<SharedRepositorySource>(),
                out Arg.Any<List<SendReceiveResult>>(), default);
        }

        [Test]
        public async Task SendReceiveAsync_ProjectNotYetCloned()
        {
            var env = new TestEnvironment();
            string ptProjectId = "paratext_" + env.Project02;
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01);
            IInternetSharedRepositorySource mockSource =
                env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
            env.SetupSuccessfulSendReceive();
            var associatedPtUser = new SFParatextUser(env.Username01);
            // FindById fails the first time, and then succeeds the second time after the pt project repo is cloned.
            env.MockScrTextCollection.FindById(env.Username01, ptProjectId, Models.TextType.Target)
                .Returns(null, env.GetScrText(associatedPtUser, ptProjectId, Models.TextType.Target));

            string clonePath = Path.Combine(env.SyncDir, ptProjectId, "target");
            env.MockFileSystemService.DirectoryExists(clonePath).Returns(false);

            // SUT
            await env.Service.SendReceiveAsync(user01Secret, ptProjectId, null);
            // Should have tried to clone the needed repo.
            env.MockFileSystemService.Received(1).CreateDirectory(clonePath);
            mockSource.Received(1).Pull(clonePath, Arg.Any<SharedRepository>());
            env.MockHgWrapper.Received(1).Update(clonePath);
        }

        [Test]
        public async Task SendReceiveAsync_SourceProjectPresent_BothSucceeds()
        {
            var env = new TestEnvironment();
            var associatedPtUser = new SFParatextUser(env.Username01);
            string targetProjectId = env.SetupProject(env.Project01, associatedPtUser);
            string sourceProjectId = "paratext_" + env.Project02;
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01);
            IInternetSharedRepositorySource mockSource =
                env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
            env.SetupSuccessfulSendReceive();

            ScrText sourceScrText = env.GetScrText(associatedPtUser, targetProjectId, Models.TextType.Source, sourceProjectId);
            env.MockScrTextCollection.FindById(env.Username01, targetProjectId, Models.TextType.Source)
                .Returns(sourceScrText);
            await env.Service.SendReceiveAsync(user01Secret, targetProjectId, sourceProjectId);
            // Below, we are checking also that the SharedProject has a
            // Permissions that is set from the SharedProject's ScrText.Permissions.
            // Better may be to assert that each SharedProject.Permissions.GetUser()
            // returns a desired PT username, if the test environment wasn't
            // mired in mock.
            env.MockSharingLogicWrapper.Received(1).ShareChanges(
                Arg.Is<List<SharedProject>>(
                    list =>
                    list.Count().Equals(2) && list[0].SendReceiveId == targetProjectId &&
                    list[1].SendReceiveId == sourceProjectId
                        && Object.ReferenceEquals(list[0].Permissions, list[0].ScrText.Permissions)
                        && Object.ReferenceEquals(list[1].Permissions, list[1].ScrText.Permissions)),
                    Arg.Any<SharedRepositorySource>(), out Arg.Any<List<SendReceiveResult>>(),
                    Arg.Any<List<SharedProject>>());
            env.MockFileSystemService.DidNotReceive().DeleteDirectory(Arg.Any<string>());

            // Replaces obsolete source project if the source project has been changed
            string newSourceProjectId = "paratext_" + env.Project03;
            string sourcePath = Path.Combine(env.SyncDir, targetProjectId, "source");
            await env.Service.SendReceiveAsync(user01Secret, targetProjectId, newSourceProjectId);
            env.MockFileSystemService.Received(1).DeleteDirectory(sourcePath);
            env.MockFileSystemService.Received(1).CreateDirectory(sourcePath);
            mockSource.Received(1).Pull(sourcePath, Arg.Is<SharedRepository>(repo =>
                repo.SendReceiveId == newSourceProjectId));
            env.MockHgWrapper.Received(1).Update(sourcePath);
        }

        private class TestEnvironment
        {
            public readonly string Project01 = "project01";
            public readonly string Project02 = "project02";
            public readonly string Project03 = "project03";
            public readonly string User01 = "user01";
            public readonly string User02 = "user02";
            public readonly string User03 = "user03";
            public readonly string Username01 = "User 01";
            public readonly string SyncDir = Path.GetTempPath();

            private string ruthBookUsfm = "\\id RUT - ProjectNameHere\n" +
                "\\c 1\n" +
                "\\v 1 Verse 1 here.\n" +
                "\\v 2 Verse 2 here.";

            public IWebHostEnvironment MockWebHostEnvironment;
            public IOptions<ParatextOptions> MockParatextOptions;
            public IRepository<UserSecret> MockRepository;
            public SFMemoryRealtimeService RealtimeService;
            public IExceptionHandler MockExceptionHandler;
            public IOptions<SiteOptions> MockSiteOptions;
            public IFileSystemService MockFileSystemService;
            public IScrTextCollection MockScrTextCollection;
            public ISharingLogicWrapper MockSharingLogicWrapper;
            public IHgWrapper MockHgWrapper;
            public MockLogger<ParatextService> MockLogger;
            public IJwtTokenHelper MockJwtTokenHelper;
            public IParatextDataHelper MockParatextDataHelper;
            public IInternetSharedRepositorySourceProvider MockInternetSharedRepositorySourceProvider;
            public ParatextService Service;

            public TestEnvironment()
            {
                MockWebHostEnvironment = Substitute.For<IWebHostEnvironment>();
                MockParatextOptions = Substitute.For<IOptions<ParatextOptions>>();
                MockRepository = Substitute.For<IRepository<UserSecret>>();
                MockExceptionHandler = Substitute.For<IExceptionHandler>();
                MockSiteOptions = Substitute.For<IOptions<SiteOptions>>();
                MockFileSystemService = Substitute.For<IFileSystemService>();
                MockLogger = new MockLogger<ParatextService>();
                MockScrTextCollection = Substitute.For<IScrTextCollection>();
                MockSharingLogicWrapper = Substitute.For<ISharingLogicWrapper>();
                MockHgWrapper = Substitute.For<IHgWrapper>();
                MockJwtTokenHelper = Substitute.For<IJwtTokenHelper>();
                MockParatextDataHelper = Substitute.For<IParatextDataHelper>();
                MockInternetSharedRepositorySourceProvider = Substitute.For<IInternetSharedRepositorySourceProvider>();

                RealtimeService = new SFMemoryRealtimeService();

                Service = new ParatextService(MockWebHostEnvironment, MockParatextOptions, MockRepository,
                    RealtimeService, MockExceptionHandler, MockSiteOptions, MockFileSystemService,
                    MockLogger, MockJwtTokenHelper, MockParatextDataHelper, MockInternetSharedRepositorySourceProvider);
                Service.ScrTextCollection = MockScrTextCollection;
                Service.SharingLogicWrapper = MockSharingLogicWrapper;
                Service.HgWrapper = MockHgWrapper;
                Service.SyncDir = SyncDir;

                MockJwtTokenHelper.GetParatextUsername(Arg.Any<UserSecret>()).Returns(User01);
                MockJwtTokenHelper.GetJwtTokenFromUserSecret(Arg.Any<UserSecret>()).Returns("token_1234");
                MockJwtTokenHelper.RefreshAccessTokenAsync(Arg.Any<ParatextOptions>(), Arg.Any<Tokens>(),
                    Arg.Any<HttpClient>())
                    .Returns(Task.FromResult(new Tokens
                    {
                        AccessToken = "token_1234",
                        RefreshToken = "refresh_token_1234"
                    }));
                MockFileSystemService.DirectoryExists(SyncDir).Returns(true);
                RegistryU.Implementation = new DotNetCoreRegistry();
                ScrTextCollection.Implementation = new SFScrTextCollection();
                AddProjectRepository();
            }

            public MockScrText ProjectScrText { get; set; }
            public CommentManager ProjectCommentManager { get; set; }

            public UserSecret MakeUserSecret(string userSecretId, string username)
            {
                var userSecret = new UserSecret();
                userSecret.Id = userSecretId;
                var ptToken = new Tokens
                {
                    AccessToken = "access_token_1234",
                    RefreshToken = "refresh_token_1234"
                };
                userSecret.ParatextTokens = ptToken;
                MockJwtTokenHelper.GetParatextUsername(Arg.Any<UserSecret>()).Returns(username);
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

                ProjectMetadata projMeta1 = GetMetadata("paratext_" + Project01, "Full Name " + Project01);
                ProjectMetadata projMeta2 = GetMetadata("paratext_" + Project02, "Full Name " + Project02);
                ProjectMetadata projMeta3 = GetMetadata("paratext_" + Project03, "Full Name " + Project03);
                mockSource.GetRepositories().Returns(new List<SharedRepository> { repo1, repo3, repo2 });
                mockSource.GetProjectsMetaData().Returns(new[] { projMeta1, projMeta2, projMeta3 });
                MockInternetSharedRepositorySourceProvider.GetSource(userSecret, Arg.Any<string>(),
                    Arg.Any<string>(), Arg.Any<string>()).Returns(mockSource);
                return mockSource;
            }

            public void AddProjectRepository()
            {
                RealtimeService.AddRepository("sf_projects", OTType.Json0, new MemoryRepository<SFProject>(
                    new[]
                    {
                        new SFProject
                        {
                            Id = "sf_id_" + Project01,
                            ParatextId = "paratext_" + Project01,
                            Name = "Full Name " + Project01,
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

            public string SetupProject(string baseId, ParatextUser associatedPtUser)
            {
                string ptProjectId = "paratext_" + baseId;
                ProjectScrText = GetScrText(associatedPtUser, baseId, Models.TextType.Target);
                ProjectCommentManager = CommentManager.Get(ProjectScrText);
                MockScrTextCollection.FindById(Arg.Any<string>(), ptProjectId, Models.TextType.Target)
                    .Returns(ProjectScrText);
                return ptProjectId;
            }

            public MockScrText GetScrText(ParatextUser associatedPtUser, string projectId, Models.TextType textType, string sourceGuid = null)
            {
                string textTypeDir;
                string guid = projectId;
                switch (textType)
                {
                    case Models.TextType.Source:
                        textTypeDir = "source";
                        Assert.NotNull(sourceGuid, "Setup: must provide a source guid");
                        guid = sourceGuid;
                        break;
                    default:
                        textTypeDir = "target";
                        break;
                }
                string scrtextDir = Path.Combine(SyncDir, projectId, textTypeDir);
                ProjectName projectName = new ProjectName() { ProjectPath = scrtextDir, ShortName = "Proj" };
                var scrText = new MockScrText(associatedPtUser, projectName);
                scrText.CachedGuid = guid;
                scrText.Data.Add("RUT", ruthBookUsfm);
                return scrText;
            }

            public void SetupSuccessfulSendReceive()
            {
                MockSharingLogicWrapper.CreateSharedProject(Arg.Any<string>(), Arg.Any<string>(),
                    Arg.Any<SharedRepositorySource>(), Arg.Any<IEnumerable<SharedRepository>>())
                    .Returns(callInfo => new SharedProject() { SendReceiveId = callInfo.ArgAt<string>(0) });
                MockSharingLogicWrapper.ShareChanges(Arg.Any<List<SharedProject>>(), Arg.Any<SharedRepositorySource>(),
                    out Arg.Any<List<SendReceiveResult>>(), Arg.Any<List<SharedProject>>()).Returns(true);
                // Have the HandleErrors method run its first argument, which would be the ShareChanges() call.
                // This helps check that the implementation code is calling ShareChanges().
                MockSharingLogicWrapper.HandleErrors(Arg.Any<Action>()).Returns(callInfo =>
                {
                    callInfo.Arg<Action>()();
                    return true;
                });
            }

            private ProjectMetadata GetMetadata(string projectId, string fullname)
            {
                string json = "{\"identification_name\": \"" +
                    fullname +
                    "\", \"identification_systemId\": [{\"type\": \"paratext\", \"text\": \"" +
                    projectId +
                    "\"}]}";
                return new ProjectMetadata(JObject.Parse(json));
            }
        }
    }
}
