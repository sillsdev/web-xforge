using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using System.Xml;
using System.Xml.Linq;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Newtonsoft.Json.Linq;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using NUnit.Framework;
using Paratext.Data;
using Paratext.Data.ProjectComments;
using Paratext.Data.ProjectFileAccess;
using Paratext.Data.RegistryServerAccess;
using Paratext.Data.Repository;
using Paratext.Data.Users;
using PtxUtils;
using SIL.Scripture;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
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
            Assert.ThrowsAsync<NullReferenceException>(() => env.Service.GetProjectsAsync(null));
        }

        [Test]
        public async Task GetProjectsAsync_ReturnCorrectRepos()
        {
            var env = new TestEnvironment();
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);

            // SUT
            IEnumerable<ParatextProject> repos = await env.Service.GetProjectsAsync(user01Secret);

            // Right number of repos returned.
            Assert.That(repos.Count(), Is.EqualTo(3));

            // Repos returned are the ones we expect.
            // TODO Make PT repos in data that should not be returned.
            foreach (string projectName in new string[] { env.Project01, env.Project03, env.Project02 })
            {
                Assert.That(repos.Single(project => project.ParatextId == env.PTProjectIds[projectName].Id), Is.Not.Null);
            }

            // Properties of one of the returned repos have the correct values.
            ParatextProject expectedProject01 = new ParatextProject
            {
                ParatextId = env.PTProjectIds[env.Project01].Id,
                Name = "Full Name " + env.Project01,
                ShortName = "P01",
                LanguageTag = "writingsystem_tag",
                ProjectId = "sf_id_" + env.Project01,
                // Not connectable since sf project exists and sf user is on sf project.
                IsConnectable = false,
                // Is connected since is in SF database and user is on project
                IsConnected = true
            };
            Assert.That(repos.Single(project => project.ParatextId == env.PTProjectIds[env.Project01].Id).ToString(),
                Is.EqualTo(expectedProject01.ToString()));

            // Repos are returned in alphabetical order by paratext project name.
            List<string> repoList = repos.Select(repo => repo.Name).ToList();
            Assert.That(StringComparer.InvariantCultureIgnoreCase.Compare(repoList[0], repoList[1]), Is.LessThan(0));
            Assert.That(StringComparer.InvariantCultureIgnoreCase.Compare(repoList[1], repoList[2]), Is.LessThan(0));
        }

        [Test]
        public async Task GetProjectsAsync_IncludesNotRegisteredProjects()
        {
            // We should include projects that are not in the registry, like back translation projects
            var env = new TestEnvironment();
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            bool extraSharedRepository = true;
            env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator, extraSharedRepository);

            // SUT
            IEnumerable<ParatextProject> repos = await env.Service.GetProjectsAsync(user01Secret);

            // Right number of repos returned.
            Assert.That(repos.Count(), Is.EqualTo(4), "Including the 4th which does not have metadata");

            // Repos returned are the ones we expect.
            foreach (string projectName in new string[] { env.Project01, env.Project02, env.Project03, env.Project04 })
            {
                Assert.That(repos.Single(project => project.ParatextId == env.PTProjectIds[projectName].Id), Is.Not.Null);
            }
        }

        [Test]
        public async Task GetProjectsAsync_ProjectNotOnSF_RetrievesProjectFullName()
        {
            var env = new TestEnvironment();
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
            IEnumerable<ParatextProject> projects = await env.Service.GetProjectsAsync(user01Secret);

            ParatextProject project02 = projects.Single(p => p.ParatextId == env.PTProjectIds[env.Project02].Id);
            Assert.That(project02.Name, Is.EqualTo("Full Name " + env.Project02));
        }

        [Test]
        public async Task GetProjectsAsync_ConnectedConnectable()
        {
            var env = new TestEnvironment();
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
            UserSecret user03Secret = env.MakeUserSecret(env.User03, env.Username03, env.ParatextUserId03);
            env.SetSharedRepositorySource(user03Secret, UserRoles.TeamMember);

            // Check resulting IsConnectable and IsConnected values across various scenarios of SF project existing,
            // SF user being a member of the SF project, and PT user being an admin on PT project.
            var testCases = new[]
            {
                new
                {
                    // Data
                    paratextProjectId = env.PTProjectIds[env.Project01].Id,
                    sfUserId = env.User01,
                    ptUsername = "User 01",
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
                    paratextProjectId = env.PTProjectIds[env.Project01].Id,
                    sfUserId = env.User03,
                    ptUsername = "User 01",
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
                    paratextProjectId = env.PTProjectIds[env.Project02].Id,
                    sfUserId = env.User01,
                    ptUsername = "User 01",
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
                    paratextProjectId = env.PTProjectIds[env.Project02].Id,
                    sfUserId = env.User03,
                    ptUsername = "User 03",
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
                    string.Empty, string.Empty).GetRepositories()
                    .FirstOrDefault(sharedRepository => sharedRepository.SendReceiveId.Id == testCase.paratextProjectId)
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
        public async Task GetResourcesAsync_ReturnResources()
        {
            var env = new TestEnvironment();
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            env.SetRestClientFactory(user01Secret);
            ScrTextCollection.Initialize("/srv/scriptureforge/projects");
            IEnumerable<ParatextResource> resources = await env.Service.GetResourcesAsync(env.User01);
            Assert.AreEqual(3, resources.Count());
        }

        [Test]
        public void GetResourcesAsync_Problem_EmptyList()
        {
            // Set up environment
            var env = new TestEnvironment();
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

            // Set up mock REST client to return unsuccessfully.
            ISFRestClientFactory mockRestClientFactory = env.SetRestClientFactory(user01Secret);
            ISFRestClient failureMockClient = Substitute.For<ISFRestClient>();
            failureMockClient.Get(Arg.Any<string>()).Throws<WebException>();
            mockRestClientFactory
                .Create(Arg.Any<string>(), Arg.Is<UserSecret>(s => s.Id == env.User02))
                .Returns(failureMockClient);

            ScrTextCollection.Initialize("/srv/scriptureforge/projects");

            IEnumerable<ParatextResource> resources = null;
            // SUT
            Assert.DoesNotThrowAsync(async () => resources = await env.Service.GetResourcesAsync(env.User02));
            // "Don't crash when permission problem");
            Assert.AreEqual(0, resources.Count(), "An empty set of resources should have been returned");
            env.MockExceptionHandler.Received().ReportException(Arg.Is<Exception>((Exception e) =>
                e.Message.Contains("inquire about resources and is ignoring error")));
        }

        [Test]
        public void IsResource_JunkInput_No()
        {
            var env = new TestEnvironment();
            // SUTs
            Assert.That(env.Service.IsResource(null), Is.False);
            Assert.That(env.Service.IsResource(""), Is.False);
            Assert.That(env.Service.IsResource("junk"), Is.False);
        }

        [Test]
        public void IsResource_NonResourceProjectId_No()
        {
            var env = new TestEnvironment();
            const int lengthOfParatextProjectIds = 40;
            string id = "1234567890abcdef1234567890abcdef12345678";
            Assert.That(id.Length, Is.EqualTo(lengthOfParatextProjectIds), "setup. Use an ID of Paratext-ID-length.");
            // SUT
            Assert.That(env.Service.IsResource(id), Is.False);
        }

        [Test]
        public void IsResource_ResourceProjectId_Yes()
        {
            var env = new TestEnvironment();
            const int lengthOfDblResourceId = 16;
            string id = "1234567890abcdef";
            Assert.That(id.Length, Is.EqualTo(lengthOfDblResourceId), "setup. Use an ID of DBL-Resource-ID-length.");
            // SUT
            Assert.That(env.Service.IsResource(id), Is.True);
        }

        [Test]
        public async Task GetPermissionsAsync_UserResourcePermission()
        {
            // Set up environment
            var env = new TestEnvironment();
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

            // Set up mock REST client to return a successful GET request
            ISFRestClientFactory mockRestClientFactory = env.SetRestClientFactory(user01Secret);

            // Set up mock REST client to return an unsuccessful GET request
            ISFRestClient failureMockClient = Substitute.For<ISFRestClient>();
            failureMockClient.Get(Arg.Any<string>()).Returns(string.Empty);
            mockRestClientFactory
                .Create(Arg.Any<string>(), Arg.Is<UserSecret>(s => s.Id == env.User02))
                .Returns(failureMockClient);

            // Set up mock project
            var projects = await env.RealtimeService.GetRepository<SFProject>().GetAllAsync();
            var project = projects.First();
            project.ParatextId = env.Resource2Id;
            var ptUsernameMapping = new Dictionary<string, string>()
                {
                    { env.User01, env.Username01 },
                    { env.User02, env.Username02 },
                };

            var permissions = await env.Service.GetPermissionsAsync(user01Secret, project, ptUsernameMapping);
            Assert.That(permissions.Count(), Is.EqualTo(2));
            Assert.That(permissions.First().Value, Is.EqualTo(TextInfoPermission.Read));
            Assert.That(permissions.Last().Value, Is.EqualTo(TextInfoPermission.None));
        }

        [Test]
        public async Task GetResourcePermissionAsync_UserNoResourcePermission()
        {
            // Set up environment
            var env = new TestEnvironment();
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

            // Set up mock REST client to return a successful GET request
            ISFRestClientFactory mockRestClientFactory = env.SetRestClientFactory(user01Secret);

            var paratextId = "resid_is_16_char";
            var permission = await env.Service.GetResourcePermissionAsync(paratextId, env.User01, CancellationToken.None);
            Assert.That(permission, Is.EqualTo(TextInfoPermission.None));
        }

        [Test]
        public async Task GetResourcePermissionAsync_UserResourcePermission()
        {
            // Set up environment
            var env = new TestEnvironment();
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            env.SetRestClientFactory(user01Secret);
            var paratextId = env.Resource2Id;
            var permission = await env.Service.GetResourcePermissionAsync(paratextId, env.User01, CancellationToken.None);
            Assert.That(permission, Is.EqualTo(TextInfoPermission.Read));
        }

        [Test]
        public void GetBooks_ReturnCorrectNumberOfBooks()
        {
            var env = new TestEnvironment();
            var associatedPtUser = new SFParatextUser(env.Username01);
            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
            UserSecret userSecret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

            // Books 1 thru 3.
            env.ProjectScrText.Settings.BooksPresentSet = new BookSet(1, 3);

            IReadOnlyList<int> result = env.Service.GetBookList(userSecret, ptProjectId);
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
            env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

            // SUT
            string result = env.Service.GetBookText(null, ptProjectId, 8);
            Assert.That(result, Is.EqualTo(ruthBookUsx));
        }

        [Test]
        public void GetBookText_NoSuchPtProjectKnown()
        {
            var env = new TestEnvironment();
            string ptProjectId = env.PTProjectIds[env.Project01].Id;
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            IInternetSharedRepositorySource mockSource =
                env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
            env.MockScrTextCollection.FindById(env.Username01, ptProjectId).Returns(i => null);

            // SUT
            Assert.Throws<DataNotFoundException>(() => env.Service.GetBookText(user01Secret, ptProjectId, 8));
            env.MockScrTextCollection.Received(1).FindById(env.Username01, ptProjectId);
        }

        [Test]
        public async Task PutBookText_TextEdited_BookTextIsUpdated()
        {
            var env = new TestEnvironment();
            var associatedPtUser = new SFParatextUser(env.Username01);
            // should be able to edit the book text even if the admin user does not have permission
            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser, hasEditPermission: false);
            UserSecret userSecret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

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
            await env.Service.PutBookText(userSecret, ptProjectId, ruthBookNum, newDocUsx.Root.ToString());
            env.ProjectFileManager.Received(1)
                .WriteFileCreatingBackup(Arg.Any<string>(), Arg.Any<Action<string>>());

            // PT username is not written to server logs
            env.MockLogger.AssertNoEvent((LogEvent logEvent) => logEvent.Message.Contains(env.Username01));
        }

        [Test]
        public async Task PutBookText_DoesNotRequireChapterAuthors()
        {
            var env = new TestEnvironment();
            var associatedPtUser = new SFParatextUser(env.Username01);
            // should be able to edit the book text even if the admin user does not have permission
            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser, hasEditPermission: false);
            UserSecret userSecret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

            int ruthBookNum = 8;
            string ruthBookUsx = "<usx version=\"3.0\">\r\n  <book code=\"RUT\" style=\"id\">- ProjectNameHere" +
                "</book>\r\n  <chapter number=\"1\" style=\"c\" />\r\n  <verse number=\"1\" style=\"v\" />" +
                "Verse 1 here. <verse number=\"2\" style=\"v\" />Verse 2 here.</usx>";

            // SUT
            await env.Service.PutBookText(userSecret, ptProjectId, ruthBookNum, ruthBookUsx);

            // Make sure only one ScrText was loaded
            env.MockScrTextCollection.Received(1).FindById(env.Username01, ptProjectId);

            // See if there is a message for the user updating the book
            string logMessage = string.Format("{0} updated {1} in {2}.", env.User01,
                    Canon.BookNumberToEnglishName(ruthBookNum), env.ProjectScrText.Name);
            env.MockLogger.AssertHasEvent((LogEvent logEvent) => logEvent.Message == logMessage);
        }

        [Test]
        public async Task PutBookText_UpdatesTheBookIfAllSameAuthor()
        {
            var env = new TestEnvironment();
            var associatedPtUser = new SFParatextUser(env.Username01);
            // should be able to edit the book text even if the admin user does not have permission
            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser, hasEditPermission: false);
            UserSecret userSecret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

            int ruthBookNum = 8;
            string ruthBookUsx = "<usx version=\"3.0\">\r\n  <book code=\"RUT\" style=\"id\">- ProjectNameHere" +
                "</book>\r\n  <chapter number=\"1\" style=\"c\" />\r\n  <verse number=\"1\" style=\"v\" />" +
                "Verse 1 here. <verse number=\"2\" style=\"v\" />Verse 2 here.</usx>";
            var chapterAuthors = new Dictionary<int, string>
            {
                { 1, env.User01 },
                { 2, env.User01 },
            };

            // SUT
            await env.Service.PutBookText(userSecret, ptProjectId, ruthBookNum, ruthBookUsx, chapterAuthors);

            // Make sure only one ScrText was loaded
            env.MockScrTextCollection.Received(1).FindById(env.Username01, ptProjectId);

            // See if there is a message for the user updating the book
            string logMessage = string.Format("{0} updated {1} in {2}.", env.User01,
                    Canon.BookNumberToEnglishName(ruthBookNum), env.ProjectScrText.Name);
            env.MockLogger.AssertHasEvent((LogEvent logEvent) => logEvent.Message == logMessage);
        }

        [Test]
        public async Task PutBookText_UpdatesTheChapterIfDifferentAuthors()
        {
            var env = new TestEnvironment();
            var associatedPtUser = new SFParatextUser(env.Username01);
            // should be able to edit the book text even if the admin user does not have permission
            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser, hasEditPermission: false);
            UserSecret userSecret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            env.MakeUserSecret(env.User02, env.Username02, env.ParatextUserId02);

            int ruthBookNum = 8;
            string ruthBookUsx = "<usx version=\"3.0\">\r\n  <book code=\"RUT\" style=\"id\">- ProjectNameHere" +
                "</book>\r\n  <chapter number=\"1\" style=\"c\" />\r\n  <verse number=\"1\" style=\"v\" />" +
                "Verse 1 here. <verse number=\"2\" style=\"v\" />Verse 2 here.</usx>";
            var chapterAuthors = new Dictionary<int, string>
            {
                { 1, env.User01 },
                { 2, env.User02 },
            };

            // SUT
            await env.Service.PutBookText(userSecret, ptProjectId, ruthBookNum, ruthBookUsx, chapterAuthors);

            // Make sure two ScrTexts were loaded
            env.MockScrTextCollection.Received(1).FindById(env.Username01, ptProjectId);
            env.MockScrTextCollection.Received(1).FindById(env.Username02, ptProjectId);

            // See if there is a message for the user updating the chapter
            string logMessage = string.Format("{0} updated chapter {1} of {2} in {3}.", env.User01, 1,
                    Canon.BookNumberToEnglishName(ruthBookNum), env.ProjectScrText.Name);
            env.MockLogger.AssertHasEvent((LogEvent logEvent) => logEvent.Message == logMessage);
        }

        [Test]
        public void GetNotes_RetrievesNotes()
        {
            int ruthBookNum = 8;
            var env = new TestEnvironment();
            var associatedPtUser = new SFParatextUser(env.Username01);
            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
            UserSecret userSecret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
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
            UserSecret userSecret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            DateTime date = DateTime.Now; // This must be consistent as it is a part of the comment id

            // Add new comment
            string threadId = "Answer_0123";
            string content = "Content for comment to update.";
            string verseRef = "RUT 1:1";
            string updateNotesString = env.GetUpdateNotesString(threadId, env.User01, date, content, verseRef);
            env.Service.PutNotes(userSecret, ptProjectId, updateNotesString);

            CommentThread thread = env.ProjectCommentManager.FindThread(threadId);
            Assert.That(thread.Comments.Count, Is.EqualTo(1));
            var comment = thread.Comments.First();
            Assert.That(comment.VerseRefStr, Is.EqualTo(verseRef));
            Assert.That(comment.User, Is.EqualTo(env.User01));
            Assert.That(comment.Contents.InnerText, Is.EqualTo(content));

            // Edit a comment
            content = "Edited: Content for comment to update.";
            updateNotesString = env.GetUpdateNotesString(threadId, env.User01, date, content, verseRef);
            env.Service.PutNotes(userSecret, ptProjectId, updateNotesString);

            Assert.That(thread.Comments.Count, Is.EqualTo(1));
            comment = thread.Comments.First();
            Assert.That(comment.Contents.InnerText, Is.EqualTo(content));

            // Delete a comment
            updateNotesString = env.GetUpdateNotesString(threadId, env.User01, date, content, verseRef, true);
            env.Service.PutNotes(userSecret, ptProjectId, updateNotesString);

            Assert.That(thread.Comments.Count, Is.EqualTo(1));
            comment = thread.Comments.First();
            Assert.That(comment.Deleted, Is.True, "Comment should be marked deleted");

            // PT username is not written to server logs
            env.MockLogger.AssertNoEvent((LogEvent logEvent) => logEvent.Message.Contains(env.Username01));
        }

        [Test]
        public async Task GetNoteThreadChanges_NotePositionUpdated()
        {
            var env = new TestEnvironment();
            var associatedPtUser = new SFParatextUser(env.Username01);
            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
            UserSecret userSecret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            env.AddTextDocs(40, 1, 6, "Context before ", "Text selected");

            env.AddNoteThreadData(new[]
            {
                new ThreadComponents { threadNum = 1, noteCount = 1 }
            });
            env.AddParatextComments(new[]
            {
                new ThreadComponents { threadNum = 1, noteCount = 1, username = env.Username01 },
                new ThreadComponents { threadNum = 2, noteCount = 1, username = env.Username01, appliesToVerse = true}
            });

            using (IConnection conn = await env.RealtimeService.ConnectAsync())
            {
                IEnumerable<IDocument<NoteThread>> noteThreadDocs =
                    await env.GetNoteThreadDocsAsync(conn, new[] { "thread1" });
                Dictionary<string, SyncUser> syncUsers = new Dictionary<string, SyncUser>
                {
                    { env.Username01, new SyncUser { Id = "syncuser01", ParatextUsername = env.Username01 }}
                };

                string contextBefore = "Context before changed ";
                string selectionText = "Text selected changed";
                Dictionary<int, ChapterDelta> chapterDeltas = env.GetChapterDeltasByBook(env.Project01, 40, 1,
                    contextBefore, selectionText, false);

                IEnumerable<NoteThreadChange> changes = env.Service.GetNoteThreadChanges(userSecret,
                    ptProjectId, 40, noteThreadDocs, chapterDeltas, syncUsers);
                Assert.That(changes.Count, Is.EqualTo(2));

                // Context, including the selected text have changed
                int expectedStartIndex = contextBefore.Length;
                NoteThreadChange change1 = changes.First(c => c.ThreadId == "thread1");
                TextAnchor expected1 = new TextAnchor { Start = expectedStartIndex, Length = selectionText.Length };
                Assert.That(change1.Position, Is.EqualTo(expected1));

                // This new SF note thread applies to the verse
                NoteThreadChange change2 = changes.First(c => c.ThreadId == "thread2");
                TextAnchor expected2 = new TextAnchor { Start = 0, Length = 0 };
                Assert.That(change2.Position, Is.EqualTo(expected2));
            }
        }

        [Test]
        public async Task GetNoteThreadChanges_NotePositionDefaulted()
        {
            var env = new TestEnvironment();
            var associatedPtUser = new SFParatextUser(env.Username01);
            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
            UserSecret userSecret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            env.AddTextDocs(40, 1, 6, "Context before ", "Text selection", false);

            env.AddNoteThreadData(new[]
            {
                new ThreadComponents { threadNum = 1, noteCount = 1 }
            });
            env.AddParatextComments(new[]
            {
                new ThreadComponents { threadNum = 1, noteCount = 1, username = env.Username01 }
            });

            using (IConnection conn = await env.RealtimeService.ConnectAsync())
            {
                IEnumerable<IDocument<NoteThread>> noteThreadDocs =
                    await env.GetNoteThreadDocsAsync(conn, new[] { "thread1" });
                Dictionary<string, SyncUser> syncUsers = new Dictionary<string, SyncUser>
                {
                    { env.Username01, new SyncUser { Id = "syncuser01", ParatextUsername = env.Username01 }}
                };
                Dictionary<int, ChapterDelta> chapterDeltas = env.GetChapterDeltasByBook(env.Project01, 40, 1,
                    "Unrecognizable context ", "unrecognizable selection", false);

                IEnumerable<NoteThreadChange> changes = env.Service.GetNoteThreadChanges(userSecret,
                    ptProjectId, 40, noteThreadDocs, chapterDeltas, syncUsers);
                Assert.That(changes.Count, Is.EqualTo(1));

                // Vigorous text changes, the note defaults to the start
                NoteThreadChange change = changes.First(c => c.ThreadId == "thread1");
                TextAnchor expected = new TextAnchor { Start = 0, Length = 0 };
                Assert.That(change.Position, Is.EqualTo(expected));
            }
        }

        [Test]
        public async Task GetNoteThreadChanges_RetrievesChanges()
        {
            var env = new TestEnvironment();
            var associatedPtUser = new SFParatextUser(env.Username01);
            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
            UserSecret userSecret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            env.AddTextDocs(40, 1, 10, "Context before ", "Text selected");

            env.AddNoteThreadData(new[]
            {
                new ThreadComponents { threadNum = 1, noteCount = 1 },
                new ThreadComponents { threadNum = 2, noteCount = 1 },
                new ThreadComponents { threadNum = 4, noteCount = 2 },
                new ThreadComponents { threadNum = 5, noteCount = 1 },
                new ThreadComponents { threadNum = 7, noteCount = 1 },
                new ThreadComponents { threadNum = 8, noteCount = 1 },
                new ThreadComponents { threadNum = 9, noteCount = 3 }
            });
            env.AddParatextComments(new[]
            {
                new ThreadComponents { threadNum = 1, noteCount = 1, username = env.Username01, isEdited = true },
                new ThreadComponents { threadNum = 2, noteCount = 1, username = env.Username01, isDeleted = true },
                new ThreadComponents { threadNum = 3, noteCount = 1, username = env.Username02 },
                new ThreadComponents { threadNum = 4, noteCount = 1, username = env.Username01 },
                new ThreadComponents { threadNum = 6, noteCount = 1, username = env.Username01, isConflict = true },
                new ThreadComponents { threadNum = 7, noteCount = 2, username = env.Username01 },
                new ThreadComponents { threadNum = 8, noteCount = 1, username = env.Username01 },
                new ThreadComponents { threadNum = 9, noteCount = 3, username = env.Username01 }
            });
            using (IConnection conn = await env.RealtimeService.ConnectAsync())
            {

                IEnumerable<IDocument<NoteThread>> noteThreadDocs =
                    await env.GetNoteThreadDocsAsync(conn,
                        new[] { "thread1", "thread2", "thread4", "thread5", "thread7", "thread8", "thread9" }
                );
                Dictionary<string, SyncUser> syncUsers = new[]
                    { new SyncUser { Id = "syncuser01", ParatextUsername = env.Username01 } }
                    .ToDictionary(u => u.ParatextUsername);
                Dictionary<int, ChapterDelta> chapterDeltas =
                    env.GetChapterDeltasByBook(env.Project01, 40, 1, "Context before ", "Text selected");
                IEnumerable<NoteThreadChange> changes = env.Service.GetNoteThreadChanges(
                    userSecret, ptProjectId, 40, noteThreadDocs, chapterDeltas, syncUsers);
                Assert.That(changes.Count, Is.EqualTo(8));
                Assert.That(changes.FirstOrDefault(c => c.ThreadId == "thread8"), Is.Null);

                // Edited comment
                NoteThreadChange change01 = changes.Where(c => c.ThreadId == "thread1").Single();
                Assert.That(change01.ThreadChangeToString(),
                    Is.EqualTo("Context before Text selected thread1 context after.-MAT 1:1-icon1"));
                Assert.That(change01.NotesUpdated.Count, Is.EqualTo(1));
                string expected1 = "thread1-syncuser01-user02-<p>thread1 note 1: EDITED.</p>-icon1";
                Assert.That(change01.NotesUpdated[0].NoteToString(), Is.EqualTo(expected1));

                // Deleted comment
                NoteThreadChange change02 = changes.Where(c => c.ThreadId == "thread2").Single();
                Assert.That(change02.ThreadChangeToString(),
                    Is.EqualTo("Context before Text selected thread2 context after.-MAT 1:2-icon2"));
                Assert.That(change02.NotesDeleted.Count, Is.EqualTo(1));
                string expected2 = "thread2-syncuser01-user02-<p>thread2 note 1.</p>-deleted-icon2";
                Assert.That(change02.NotesDeleted[0].NoteToString(), Is.EqualTo(expected2));

                // Added comment on new thread
                NoteThreadChange change03 = changes.Where(c => c.ThreadId == "thread3").Single();
                Assert.That(change03.ThreadChangeToString(),
                    Is.EqualTo("Context before Text selected thread3 context after.-Start:15-Length:21-MAT 1:3-icon3"));
                Assert.That(change03.NotesAdded.Count, Is.EqualTo(1));
                string expected3 = "thread3-syncuser03-user02-<p>thread3 note 1.</p>-icon3";
                Assert.That(change03.NotesAdded[0].NoteToString(), Is.EqualTo(expected3));
                Assert.That(syncUsers.Keys, Is.EquivalentTo(new[] { env.Username01, env.Username02 }));

                // Permanently removed comment
                NoteThreadChange change04 = changes.Where(c => c.ThreadId == "thread4").Single();
                Assert.That(change04.ThreadChangeToString(),
                    Is.EqualTo("Context before Text selected thread4 context after.-MAT 1:4-icon4"));
                Assert.That(change04.NoteIdsRemoved, Is.EquivalentTo(new[] { "n2onthread4" }));

                // Permanently removed thread
                NoteThreadChange change05 = changes.Where(c => c.ThreadId == "thread5").Single();
                Assert.That(change05.ThreadChangeToString(),
                    Is.EqualTo("Context before Text selected thread5 context after.-MAT 1:5-icon5"));
                Assert.That(change05.ThreadRemoved, Is.True);

                // Added conflict comment
                NoteThreadChange change06 = changes.Where(c => c.ThreadId == "thread6").Single();
                Assert.That(change06.ThreadChangeToString(),
                    Is.EqualTo("Context before Text selected thread6 context after.-Start:15-Length:21-MAT 1:6-conflict1"));
                string expected6 = "thread6-syncuser01-user02-<p>thread6 note 1.</p>-conflict1";
                Assert.That(change06.NotesAdded[0].NoteToString(), Is.EqualTo(expected6));

                // Added comment on existing thread
                NoteThreadChange change07 = changes.Where(c => c.ThreadId == "thread7").Single();
                string expected7 = "thread7-syncuser01-user02-<p>thread7 note 2.</p>";
                Assert.That(change07.NotesAdded[0].NoteToString(), Is.EqualTo(expected7));

                // Removed tag icon on repeated todo notes
                NoteThreadChange change08 = changes.Where(c => c.ThreadId == "thread9").Single();
                Assert.That(change08.NotesUpdated[0].DataId, Is.EqualTo("n2onthread9"));
                Assert.That(change08.NotesUpdated[0].TagIcon, Is.EqualTo(null));
                Assert.That(change08.NotesUpdated[1].DataId, Is.EqualTo("n3onthread9"));
                Assert.That(change08.NotesUpdated[1].TagIcon, Is.EqualTo(null));
            }
        }

        [Test]
        public async Task GetNoteThreadChanges_UseCorrectTagIcon()
        {
            var env = new TestEnvironment();
            var associatedPtUser = new SFParatextUser(env.Username01);
            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
            UserSecret userSecret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            env.AddTextDocs(40, 1, 10, "Context before ", "Text selected");

            env.AddNoteThreadData(new[]
            {
                new ThreadComponents { threadNum = 1, noteCount = 9 },
            });
            ThreadNoteComponents[] threadNotes = new[] {
                new ThreadNoteComponents { status = NoteStatus.Todo, tagsAdded = new [] { "2" } },
                new ThreadNoteComponents { status = NoteStatus.Unspecified },
                new ThreadNoteComponents { status = NoteStatus.Unspecified },
                new ThreadNoteComponents { status = NoteStatus.Deleted },
                new ThreadNoteComponents { status = NoteStatus.Todo, tagsAdded = new [] { "3" } },
                new ThreadNoteComponents { status = NoteStatus.Unspecified },
                new ThreadNoteComponents { status = NoteStatus.Done },
                new ThreadNoteComponents { status = NoteStatus.Todo },
                new ThreadNoteComponents { status = NoteStatus.Todo, tagsAdded = new [] { "4" } }
            };
            env.AddParatextComments(new[]
            {
                new ThreadComponents { threadNum = 1, noteCount = threadNotes.Count(), notes = threadNotes, username = env.Username01 },
            });

            using (IConnection conn = await env.RealtimeService.ConnectAsync())
            {

                IEnumerable<IDocument<NoteThread>> noteThreadDocs =
                    await env.GetNoteThreadDocsAsync(conn,
                        new[] { "thread1" }
                );
                Dictionary<string, SyncUser> syncUsers = new[]
                    { new SyncUser { Id = "syncuser01", ParatextUsername = env.Username01 } }
                    .ToDictionary(u => u.ParatextUsername);
                Dictionary<int, ChapterDelta> chapterDeltas =
                    env.GetChapterDeltasByBook(env.Project01, 40, 1, "Context before ", "Text selected");
                IEnumerable<NoteThreadChange> changes = env.Service.GetNoteThreadChanges(
                    userSecret, ptProjectId, 40, noteThreadDocs, chapterDeltas, syncUsers);

                List<string> expectedIcons = new List<string>() {
                    "icon2",
                    null,
                    null,
                    "icon2",
                    "icon3",
                    null,
                    "icon3",
                    "icon3",
                    "icon4",
                };
                NoteThreadChange changedThread = changes.Where(c => c.ThreadId == "thread1").Single();
                Assert.That(changedThread.TagIcon, Is.EqualTo("icon4"));
                for (int i = 0; i < expectedIcons.Count(); i++)
                {
                    Note note = changedThread.NotesUpdated[i];
                    Assert.That(note.DataId, Is.EqualTo($"n{i + 1}onthread1"));
                    Assert.That(note.TagIcon, Is.EqualTo(expectedIcons[i]));
                }
            }
        }

        [Test]
        public async Task GetNoteThreadChanges_MatchNotePositionToVerseText()
        {
            var env = new TestEnvironment();
            var associatedPTUser = new SFParatextUser(env.Username01);
            string ptProjectId = env.SetupProject(env.Project01, associatedPTUser);
            UserSecret userSecret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

            env.AddParatextComments(new[]
            {
                new ThreadComponents { threadNum = 1, noteCount = 1, username = env.Username01, alternateText = SelectionType.RelatedVerse },
                new ThreadComponents { threadNum = 8, noteCount = 1, username = env.Username01, alternateText = SelectionType.Section },
                new ThreadComponents { threadNum = 10, noteCount = 1, username = env.Username01, alternateText = SelectionType.RelatedVerse }
            });

            using (IConnection conn = await env.RealtimeService.ConnectAsync())
            {
                var deltas = env.GetChapterDeltasByBook(env.Project01, 40, 1, "Context before ", "Text selected",
                    true, true);
                Dictionary<string, SyncUser> syncUsers = new Dictionary<string, SyncUser> {
                    { "syncuser01",  new SyncUser { Id = "syncuser01", ParatextUsername = env.Username01 } }
                };
                IEnumerable<NoteThreadChange> changes = env.Service.GetNoteThreadChanges(userSecret, ptProjectId, 40,
                    new IDocument<NoteThread>[0], deltas, syncUsers);

                Assert.That(changes.Count, Is.EqualTo(3));
                NoteThreadChange thread1Change = changes.Single(c => c.ThreadId == "thread1");
                // The full matching text of thread1Change.SelectedText is not found. The best match is a substring.
                // This test also verifies that fetching verse text for verse 1 will fetch text from segment
                // "verse_1_1" but not segment "verse_1_10/p_1" (even tho the second segment name starts with the first
                // segment name). Incorrectly also fetching from "verse_1_10/p_1" would result in having a match for
                // thread1Change.SelectedText.
                Assert.That(thread1Change.SelectedText, Is.EqualTo("other text in verse"), "setup");
                Assert.That(thread1Change.Position.Length, Is.LessThan("other text in verse".Length));

                NoteThreadChange thread8Change = changes.Single(c => c.ThreadId == "thread8");
                string textBefore8 = "Context before Text selected thread8 context after.";
                int thread8AnchoringLength = "Section heading text".Length;
                TextAnchor expected8 = new TextAnchor { Start = textBefore8.Length, Length = thread8AnchoringLength };
                Assert.That(thread8Change.Position, Is.EqualTo(expected8));

                NoteThreadChange thread10Change = changes.Single(c => c.ThreadId == "thread10");
                string textBefore10 = "Context before Text selected thread10 context after.*";
                int thread10AnchoringLength = "other text in verse".Length;
                TextAnchor expected10 = new TextAnchor { Start = textBefore10.Length, Length = thread10AnchoringLength };
                // This test also verifies that fetching verse text for verse 10 will fetch text from both segments
                // "verse_1_10" and "verse_1_10/p_1".
                Assert.That(thread10Change.Position, Is.EqualTo(expected10));
            }
        }

        [Test]
        public async Task GetNoteThreadChanges_ReattachedNote_PositionUpdated()
        {
            var env = new TestEnvironment();
            var associatedPtUser = new SFParatextUser(env.Username01);
            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
            UserSecret userSecret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            env.AddTextDocs(40, 1, 6, "Context before ", "Text selected");
            // The text doc is set up so that verse 7 has unique text that we reattach to
            string verseStr = "MAT 1:7";
            ReattachedThreadInfo rti = env.GetReattachedThreadInfo(verseStr);

            env.AddNoteThreadData(new[]
            {
                new ThreadComponents { threadNum = 1, noteCount = 1 },
                new ThreadComponents { threadNum = 3, noteCount = 1, reattachedVerseStr = verseStr },
                new ThreadComponents { threadNum = 4, noteCount = 1 },
                new ThreadComponents { threadNum = 5, noteCount = 1, reattachedVerseStr = verseStr }
            });
            env.AddParatextComments(new[]
            {
                new ThreadComponents { threadNum = 1, noteCount = 1, username = env.Username01, reattachedVerseStr = verseStr },
                new ThreadComponents { threadNum = 2, noteCount = 1, username = env.Username01, reattachedVerseStr = verseStr },
                new ThreadComponents { threadNum = 3, noteCount = 1, username = env.Username01, reattachedVerseStr = verseStr },
                new ThreadComponents { threadNum = 4, noteCount = 2, username = env.Username01, reattachedVerseStr = verseStr },
                new ThreadComponents { threadNum = 5, noteCount = 1, username = env.Username01 }
            });

            using (IConnection conn = await env.RealtimeService.ConnectAsync())
            {
                IEnumerable<IDocument<NoteThread>> noteThreadDocs =
                    await env.GetNoteThreadDocsAsync(conn, new[] { "thread1", "thread3", "thread4", "thread5" });
                Dictionary<int, ChapterDelta> chapterDeltas =
                    env.GetChapterDeltasByBook(env.Project01, 40, 1, env.ContextBefore, "Text selected");
                Dictionary<string, SyncUser> syncUsers = new Dictionary<string, SyncUser>
                {
                    { "syncuser01", new SyncUser { Id = "syncuser01", ParatextUsername = env.Username01 } }
                };
                IEnumerable<NoteThreadChange> changes = env.Service.GetNoteThreadChanges(userSecret, ptProjectId, 40,
                    noteThreadDocs, chapterDeltas, syncUsers);
                Assert.That(changes.Count, Is.EqualTo(4));

                // The reattach note in thread3 is existing and is not changed
                Assert.That(changes.FirstOrDefault(c => c.ThreadId == "thread3"), Is.Null);
                // Existing thread reattached
                NoteThreadChange change1 = changes.Single(c => c.ThreadId == "thread1");
                Assert.That(change1.NotesAdded.Count, Is.EqualTo(1));
                Assert.That(change1.NotesAdded.Single().Reattached, Is.Not.Null);
                TextAnchor expectedAnchor = new TextAnchor
                {
                    Start = rti.contextBefore.Length,
                    Length = rti.selectedText.Length
                };
                Assert.That(change1.Position, Is.EqualTo(expectedAnchor));

                // New thread note reattached
                NoteThreadChange change2 = changes.Single(c => c.ThreadId == "thread2");
                Assert.That(change2.NotesAdded.Count, Is.EqualTo(2));
                Assert.That(change2.NotesAdded[1].Reattached, Is.Not.Null);
                Assert.That(change2.Position, Is.EqualTo(expectedAnchor));

                // Existing thread new comment and reattached
                NoteThreadChange change4 = changes.Single(c => c.ThreadId == "thread4");
                Assert.That(change4.NotesAdded.Count, Is.EqualTo(2));
                Assert.That(change4.NotesAdded[1].Reattached, Is.Not.Null);
                Assert.That(change4.Position, Is.EqualTo(expectedAnchor));

                // Existing thread and reattach comment removed
                NoteThreadChange change5 = changes.Single(c => c.ThreadId == "thread5");
                Assert.That(change5.NoteIdsRemoved.Count, Is.EqualTo(1));
                Assert.That(change5.NoteIdsRemoved[0], Is.EqualTo("reattachedthread5"));
                // The context of the original note thread is not what the thread was reattached and un-reattached to
                Assert.That(change5.ContextBefore, Is.Not.EqualTo(rti.contextBefore));
                Assert.That(change5.SelectedText, Is.Not.EqualTo(rti.selectedText));
                TextAnchor originalAnchor = new TextAnchor
                {
                    Start = change5.ContextBefore.Length,
                    Length = change5.SelectedText.Length
                };
                Assert.That(change5.Position, Is.EqualTo(originalAnchor));
            }
        }

        [Test]
        public async Task UpdateParatextComments_AddsComment()
        {
            var env = new TestEnvironment();
            var associatedPtUser = new SFParatextUser(env.Username01);
            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
            UserSecret userSecret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

            string threadId = "thread1";
            env.AddNoteThreadData(new[]
                { new ThreadComponents { threadNum = 1, noteCount = 1, isNew = true } });
            using (IConnection conn = await env.RealtimeService.ConnectAsync())
            {
                CommentThread thread = env.ProjectCommentManager.FindThread(threadId);
                Assert.That(thread, Is.Null);
                IDocument<NoteThread> noteThreadDoc = await env.GetNoteThreadDocAsync(conn, threadId);
                Dictionary<string, SyncUser> syncUsers = new Dictionary<string, SyncUser>();
                await env.Service.UpdateParatextCommentsAsync(userSecret, ptProjectId, 40, new[] { noteThreadDoc },
                    syncUsers);
                thread = env.ProjectCommentManager.FindThread(threadId);
                Assert.That(thread.Comments.Count, Is.EqualTo(1));
                var comment = thread.Comments.First();
                string expected = "thread1/User 02/2019-01-01T08:00:00.0000000+00:00-" + "MAT 1:1-" +
                    "<p>thread1 note 1.</p>-" + "Start:0-" + "user02-" + "Tag:1";
                Assert.That(comment.CommentToString(), Is.EqualTo(expected));
                Assert.That(syncUsers.Keys, Is.EquivalentTo(new[] { env.Username02 }));
                Assert.That(noteThreadDoc.Data.Notes[0].SyncUserRef, Is.EqualTo("syncuser02"));

                // PT username is not written to server logs
                env.MockLogger.AssertNoEvent((LogEvent logEvent) => logEvent.Message.Contains(env.Username02));
            }
        }

        [Test]
        public async Task UpdateParatextComments_EditsComment()
        {
            var env = new TestEnvironment();
            var associatedPtUser = new SFParatextUser(env.Username01);
            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
            UserSecret userSecret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

            string threadId = "thread1";
            env.AddNoteThreadData(new[]
                { new ThreadComponents { threadNum = 1, noteCount = 1, username = env.Username01, isEdited = true } });
            env.AddParatextComments(new[]
                { new ThreadComponents { threadNum = 1, noteCount = 1, username = env.Username01 } });

            using (IConnection conn = await env.RealtimeService.ConnectAsync())
            {
                IDocument<NoteThread> noteThreadDoc = await env.GetNoteThreadDocAsync(conn, threadId);
                // Edit a comment
                Dictionary<string, SyncUser> syncUsers = new[]
                {
                    new SyncUser { Id =  "syncuser01", ParatextUsername = env.Username01 }
                }.ToDictionary(u => u.ParatextUsername);
                await env.Service.UpdateParatextCommentsAsync(userSecret, ptProjectId, 40, new[] { noteThreadDoc },
                    syncUsers);

                CommentThread thread = env.ProjectCommentManager.FindThread(threadId);
                Assert.That(thread.Comments.Count, Is.EqualTo(1));
                var comment = thread.Comments.First();
                string expected = "thread1/User 01/2019-01-01T08:00:00.0000000+00:00-" + "MAT 1:1-" +
                    "<p>thread1 note 1: EDITED.</p>-" + "Start:15-" + "user02-" + "Tag:1";
                Assert.That(comment.CommentToString(), Is.EqualTo(expected));
                Assert.That(syncUsers.Count(), Is.EqualTo(1));

                // PT username is not written to server logs
                env.MockLogger.AssertNoEvent((LogEvent logEvent) => logEvent.Message.Contains(env.Username01));
            }
        }

        [Test]
        public async Task UpdateParatextComments_DeletesComment()
        {
            var env = new TestEnvironment();
            var associatedPtUser = new SFParatextUser(env.Username01);
            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
            UserSecret userSecret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

            string threadId = "thread1";
            env.AddNoteThreadData(new[]
                { new ThreadComponents { threadNum = 1, noteCount = 1, username = env.Username01, isDeleted = true } });
            env.AddParatextComments(new[]
                { new ThreadComponents { threadNum = 1, noteCount = 1, username = env.Username01 } });

            using (IConnection conn = await env.RealtimeService.ConnectAsync())
            {
                IDocument<NoteThread> noteThreadDoc = await env.GetNoteThreadDocAsync(conn, threadId);

                // Delete a comment
                Dictionary<string, SyncUser> syncUsers = new[]
                {
                    new SyncUser { Id =  "syncuser01", ParatextUsername = env.Username01 }
                }.ToDictionary(u => u.ParatextUsername);
                await env.Service.UpdateParatextCommentsAsync(userSecret, ptProjectId, 40, new[] { noteThreadDoc },
                    syncUsers);

                CommentThread thread = env.ProjectCommentManager.FindThread(threadId);
                Assert.That(thread.Comments.Count, Is.EqualTo(1));
                var comment = thread.Comments.First();
                string expected = "thread1/User 01/2019-01-01T08:00:00.0000000+00:00-" + "MAT 1:1-" +
                    "<p>thread1 note 1.</p>-" + "Start:15-" + "user02-" + "deleted-" + "Tag:1";
                Assert.That(comment.CommentToString(), Is.EqualTo(expected));

                // PT username is not written to server logs
                env.MockLogger.AssertNoEvent((LogEvent logEvent) => logEvent.Message.Contains(env.Username01));
            }
        }

        [Test]
        public void SendReceiveAsync_BadArguments()
        {
            var env = new TestEnvironment();
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            Assert.ThrowsAsync<ArgumentNullException>(() => env.Service.SendReceiveAsync(null, null, null));
            Assert.ThrowsAsync<ArgumentNullException>(() => env.Service.SendReceiveAsync(null,
                env.PTProjectIds[env.Project01].Id, null));
            Assert.ThrowsAsync<ArgumentNullException>(() => env.Service.SendReceiveAsync(user01Secret, null, null));
        }

        [Test]
        public void SendReceiveAsync_ShareChangesErrors_Throws()
        {
            var env = new TestEnvironment();
            var associatedPtUser = new SFParatextUser(env.Username01);
            string projectId = env.SetupProject(env.Project01, associatedPtUser);
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

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
        public void SendReceiveAsync_ShareChangesErrors_InResultsOnly()
        {
            var env = new TestEnvironment();
            var associatedPtUser = new SFParatextUser(env.Username01);
            string projectId = env.SetupProject(env.Project01, associatedPtUser);
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

            IInternetSharedRepositorySource mockSource =
                env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
            env.SetupSuccessfulSendReceive();
            // Setup share changes to be unsuccessful, but return true
            // This scenario occurs if a project is locked on the PT server
            env.MockSharingLogicWrapper.ShareChanges(Arg.Any<List<SharedProject>>(), Arg.Any<SharedRepositorySource>(),
                out Arg.Any<List<SendReceiveResult>>(), Arg.Any<List<SharedProject>>()).Returns(x =>
                {
                    x[2] = new List<SendReceiveResult>
                    {
                        new SendReceiveResult(new SharedProject())
                        {
                            Result = SendReceiveResultEnum.Failed,
                        },
                    };
                    return true;
                });

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
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            IInternetSharedRepositorySource mockSource =
                env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
            env.SetupSuccessfulSendReceive();

            // SUT 1
            await env.Service.SendReceiveAsync(user01Secret, ptProjectId, null);
            env.MockSharingLogicWrapper.Received(1).ShareChanges(Arg.Is<List<SharedProject>>(list =>
                list.Count == 1 && list[0].SendReceiveId.Id == ptProjectId), Arg.Any<SharedRepositorySource>(),
                out Arg.Any<List<SendReceiveResult>>(),
                Arg.Is<List<SharedProject>>(list => list.Count == 1 && list[0].SendReceiveId.Id == ptProjectId));
            mockSource.DidNotReceive().Pull(Arg.Any<string>(), Arg.Any<SharedRepository>());
            env.MockSharingLogicWrapper.ClearReceivedCalls();

            // Passing a PT project Id for a project the user does not have access to fails early without doing S/R
            // SUT 2
            ArgumentException resultingException = Assert.ThrowsAsync<ArgumentException>(() =>
                env.Service.SendReceiveAsync(user01Secret, "unknownPtProjectId8"));
            Assert.That(resultingException.Message, Does.Contain("unknownPtProjectId8"));
            env.MockSharingLogicWrapper.DidNotReceive().ShareChanges(default, Arg.Any<SharedRepositorySource>(),
                out Arg.Any<List<SendReceiveResult>>(), default);
        }

        [Test]
        public async Task SendReceiveAsync_ProjectNotYetCloned()
        {
            var env = new TestEnvironment();
            string ptProjectId = env.PTProjectIds[env.Project02].Id;
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            IInternetSharedRepositorySource mockSource =
                env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
            env.SetupSuccessfulSendReceive();
            var associatedPtUser = new SFParatextUser(env.Username01);
            // FindById fails the first time, and then succeeds the second time after the pt project repo is cloned.
            MockScrText scrText = env.GetScrText(associatedPtUser, ptProjectId);
            env.MockScrTextCollection.FindById(env.Username01, ptProjectId).Returns(null, scrText);

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
            string sourceProjectId = env.PTProjectIds[env.Project02].Id;
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            IInternetSharedRepositorySource mockSource =
                env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
            env.SetupSuccessfulSendReceive();

            ScrText sourceScrText = env.GetScrText(associatedPtUser, sourceProjectId);
            env.MockScrTextCollection.FindById(env.Username01, sourceProjectId)
                .Returns(sourceScrText);

            // Get the permissions, as the ScrText will be disposed in ShareChanges()
            ComparableProjectPermissionManager sourceScrTextPermissions
                = (ComparableProjectPermissionManager)sourceScrText.Permissions;
            ComparableProjectPermissionManager targetScrTextPermissions
                = (ComparableProjectPermissionManager)env.ProjectScrText.Permissions;

            await env.Service.SendReceiveAsync(user01Secret, targetProjectId);
            await env.Service.SendReceiveAsync(user01Secret, sourceProjectId);
            // Below, we are checking also that the SharedProject has a
            // Permissions that is set from the SharedProject's ScrText.Permissions.
            // Better may be to assert that each SharedProject.Permissions.GetUser()
            // returns a desired PT username, if the test environment wasn't
            // mired in mock.
            env.MockSharingLogicWrapper.Received(2).ShareChanges(
                Arg.Is<List<SharedProject>>(
                    list =>
                    list.Count().Equals(1) &&
                        (list[0].SendReceiveId.Id == targetProjectId || list[0].SendReceiveId.Id == sourceProjectId) &&
                        (sourceScrTextPermissions.Equals((ComparableProjectPermissionManager)list[0].Permissions)
                        || targetScrTextPermissions.Equals((ComparableProjectPermissionManager)list[0].Permissions))),
                    Arg.Any<SharedRepositorySource>(), out Arg.Any<List<SendReceiveResult>>(),
                    Arg.Any<List<SharedProject>>());
            env.MockFileSystemService.DidNotReceive().DeleteDirectory(Arg.Any<string>());

            // Replaces obsolete source project if the source project has been changed
            string newSourceProjectId = env.PTProjectIds[env.Project03].Id;
            string sourcePath = Path.Combine(env.SyncDir, newSourceProjectId, "target");

            // Only set the the new source ScrText when it is "cloned" to the filesystem
            env.MockFileSystemService.When(fs => fs.CreateDirectory(sourcePath)).Do(_ =>
            {
                ScrText newSourceScrText = env.GetScrText(associatedPtUser, newSourceProjectId);
                env.MockScrTextCollection.FindById(env.Username01, newSourceProjectId)
                    .Returns(newSourceScrText);
            });

            await env.Service.SendReceiveAsync(user01Secret, targetProjectId);
            await env.Service.SendReceiveAsync(user01Secret, newSourceProjectId);
            env.MockFileSystemService.DidNotReceive().DeleteDirectory(Arg.Any<string>());
            env.MockFileSystemService.Received(1).CreateDirectory(sourcePath);
            mockSource.Received(1).Pull(sourcePath, Arg.Is<SharedRepository>(repo =>
                repo.SendReceiveId.Id == newSourceProjectId));
            env.MockHgWrapper.Received(1).Update(sourcePath);
        }

        [Test]
        public async Task SendReceiveAsync_SourceResource_Missing()
        {
            var env = new TestEnvironment();
            var associatedPtUser = new SFParatextUser(env.Username01);
            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            IInternetSharedRepositorySource mockSource =
                env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
            env.SetupSuccessfulSendReceive();
            env.SetRestClientFactory(user01Secret);
            ScrTextCollection.Initialize("/srv/scriptureforge/projects");
            string resourceId = "test_resource_id"; // A missing or invalid resource or project
            await env.Service.SendReceiveAsync(user01Secret, ptProjectId);
            Assert.ThrowsAsync<ArgumentException>(() => env.Service.SendReceiveAsync(user01Secret, resourceId));
        }

        [Test]
        public async Task SendReceiveAsync_SourceResource_Valid()
        {
            var env = new TestEnvironment();
            var associatedPtUser = new SFParatextUser(env.Username01);
            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            IInternetSharedRepositorySource mockSource =
                env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
            env.SetupSuccessfulSendReceive();
            env.SetRestClientFactory(user01Secret);
            ScrTextCollection.Initialize("/srv/scriptureforge/projects");
            string resourceId = env.Resource3Id; // See the XML in SetRestClientFactory for this
            await env.Service.SendReceiveAsync(user01Secret, ptProjectId);
            await env.Service.SendReceiveAsync(user01Secret, resourceId);
        }

        [Test]
        public async Task TryGetProjectRoleAsync_UsesTheRepositoryForUnregisteredProjects()
        {
            var env = new TestEnvironment();
            UserSecret userSecret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            env.AddProjectRepository();
            env.SetSharedRepositorySource(userSecret, UserRoles.Administrator);
            var projects = await env.RealtimeService.GetRepository<SFProject>().GetAllAsync();
            var project = projects.First();
            var attempt =
                await env.Service.TryGetProjectRoleAsync(userSecret, project.ParatextId, CancellationToken.None);
            Assert.That(attempt.Success, Is.True);
            Assert.That(attempt.Result, Is.EqualTo(SFProjectRole.Administrator));
        }

        [Test]
        public async Task TryGetProjectRoleAsync_UsesTheRepositoryForUnregisteredProjectsAndFailsIfUserDoesntExist()
        {
            var env = new TestEnvironment();
            UserSecret userSecret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            env.AddProjectRepository();
            // Notice that SetSharedRepositorySource is not called here
            var projects = await env.RealtimeService.GetRepository<SFProject>().GetAllAsync();
            var project = projects.First();
            var attempt =
                await env.Service.TryGetProjectRoleAsync(userSecret, project.ParatextId, CancellationToken.None);
            Assert.That(attempt.Success, Is.False);
            Assert.That(attempt.Result, Is.Empty);
        }

        [Test]
        public async Task GetProjectRolesAsync_UsesTheRepositoryForUnregisteredProjects()
        {
            var env = new TestEnvironment();
            UserSecret userSecret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            env.MakeUserSecret(env.User02, env.Username02, env.ParatextUserId02);
            env.AddProjectRepository();
            env.SetSharedRepositorySource(userSecret, UserRoles.Administrator);
            var projects = await env.RealtimeService.GetRepository<SFProject>().GetAllAsync();
            var project = projects.First();
            var roles = await env.Service.GetProjectRolesAsync(userSecret, project, CancellationToken.None);
            Assert.That(roles.Count, Is.EqualTo(2));
            var firstRole = new KeyValuePair<string, string>(env.ParatextUserId01, SFProjectRole.Administrator);
            Assert.That(roles.First(), Is.EqualTo(firstRole));
            var secondRole = new KeyValuePair<string, string>(env.ParatextUserId02, SFProjectRole.Administrator);
            Assert.That(roles.Last(), Is.EqualTo(secondRole));
        }

        [Test]
        public async Task GetParatextUsernameMappingAsync_UsesTheRepositoryForUnregisteredProjects()
        {
            var env = new TestEnvironment();
            UserSecret userSecret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            env.MakeUserSecret(env.User02, env.Username02, env.ParatextUserId02);
            env.AddProjectRepository();
            env.SetSharedRepositorySource(userSecret, UserRoles.Administrator);
            var projects = await env.RealtimeService.GetRepository<SFProject>().GetAllAsync();
            var project = projects.First();
            var mapping = await env.Service.GetParatextUsernameMappingAsync(userSecret, project, CancellationToken.None);
            Assert.That(mapping.Count, Is.EqualTo(2));
            Assert.That(mapping.First(), Is.EqualTo(new KeyValuePair<string, string>(env.User01, env.Username01)));
            Assert.That(mapping.Last(), Is.EqualTo(new KeyValuePair<string, string>(env.User02, env.Username02)));
        }

        [Test]
        public async Task GetParatextUsernameMappingAsync_ReturnsEmptyMappingForResourceProject()
        {
            var env = new TestEnvironment();
            const string resourceId = "1234567890abcdef";
            Assert.That(resourceId.Length, Is.EqualTo(SFInstallableDblResource.ResourceIdentifierLength));
            var userSecret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            var mapping = await env.Service.GetParatextUsernameMappingAsync(userSecret,
                new SFProject { ParatextId = resourceId }, CancellationToken.None);
            Assert.That(mapping.Count, Is.EqualTo(0));
        }

        enum SelectionType
        {
            Standard,
            RelatedVerse,
            Section
        }

        struct ThreadComponents
        {
            public int threadNum;
            public int noteCount;
            public ThreadNoteComponents[] notes;
            public string username;
            public SelectionType alternateText;
            public bool isNew;
            public bool isEdited;
            public bool isDeleted;
            public bool isConflict;
            public bool appliesToVerse;
            public string reattachedVerseStr;
        }

        struct ReattachedThreadInfo
        {
            public string verseStr;
            public string selectedText;
            public string startPos;
            public string contextBefore;
            public string contextAfter;
        }

        struct ThreadNoteComponents
        {
            public Enum<NoteStatus> status;
            public string[] tagsAdded;
        }

        [Test]
        public void GetLatestSharedVersion_ForPTProject()
        {
            var env = new TestEnvironment();
            var associatedPtUser = new SFParatextUser(env.Username01);
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
            ScrText scrText = env.GetScrText(associatedPtUser, ptProjectId);
            string lastPublicRevision = "abc123";
            env.MockHgWrapper.GetLastPublicRevision(scrText.Directory)
                .Returns(lastPublicRevision);

            // SUT
            string latestSharedVersion = env.Service.GetLatestSharedVersion(user01Secret, ptProjectId);

            Assert.That(latestSharedVersion, Is.EqualTo(lastPublicRevision));
        }

        [Test]
        public void GetLatestSharedVersion_ForDBLResource()
        {
            var env = new TestEnvironment();
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

            string resourcePTId = "1234567890123456";
            Assert.That(resourcePTId, Has.Length.EqualTo(SFInstallableDblResource.ResourceIdentifierLength),
                "setup. Should be using a project ID that is a resource ID");

            // SUT
            string latestSharedVersion = env.Service.GetLatestSharedVersion(user01Secret, resourcePTId);

            Assert.That(latestSharedVersion, Is.Null,
                "DBL resources do not have hg repositories to have a last pushed or pulled hg commit id.");
            // Wouldn't have ended up trying to find a ScrText or querying hg.
            env.MockScrTextCollection.DidNotReceiveWithAnyArgs().FindById(default, default);
            env.MockHgWrapper.DidNotReceiveWithAnyArgs().GetLastPublicRevision(default);
        }

        [Test]
        public void BackupExists_Failure()
        {
            // Setup test environment
            var env = new TestEnvironment();
            ScrTextCollection.Initialize("/srv/scriptureforge/projects");
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            var associatedPtUser = new SFParatextUser(env.Username01);
            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
            env.MockFileSystemService.FileExists(Arg.Any<string>()).Throws(new UnauthorizedAccessException());

            // SUT
            bool result = env.Service.BackupExists(user01Secret, ptProjectId);
            Assert.IsFalse(result);
        }

        [Test]
        public void BackupExists_Missing()
        {
            // Setup test environment
            var env = new TestEnvironment();
            ScrTextCollection.Initialize("/srv/scriptureforge/projects");
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            var associatedPtUser = new SFParatextUser(env.Username01);
            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
            env.MockFileSystemService.FileExists(Arg.Any<string>()).Returns(false);

            // SUT
            bool result = env.Service.BackupExists(user01Secret, ptProjectId);
            Assert.IsFalse(result);
        }

        [Test]
        public void BackupExists_Success()
        {
            // Setup test environment
            var env = new TestEnvironment();
            ScrTextCollection.Initialize("/srv/scriptureforge/projects");
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            var associatedPtUser = new SFParatextUser(env.Username01);
            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
            env.MockFileSystemService.FileExists(Arg.Any<string>()).Returns(true);

            // SUT
            bool result = env.Service.BackupExists(user01Secret, ptProjectId);
            Assert.IsTrue(result);
        }

        [Test]
        public void BackupRepository_Failure()
        {
            // Setup test environment
            var env = new TestEnvironment();
            ScrTextCollection.Initialize("/srv/scriptureforge/projects");
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            var associatedPtUser = new SFParatextUser(env.Username01);
            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
            env.MockFileSystemService.FileExists(Arg.Any<string>()).Throws(new UnauthorizedAccessException());

            // SUT
            bool result = env.Service.BackupRepository(user01Secret, ptProjectId);
            Assert.IsFalse(result);
        }

        [Test]
        public void BackupRepository_InvalidProject()
        {
            // Setup test environment
            var env = new TestEnvironment();
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            string ptProjectId = "invalid_project";

            // SUT
            bool result = env.Service.BackupRepository(user01Secret, ptProjectId);
            Assert.IsFalse(result);
        }

        [Test]
        public void BackupRepository_Success()
        {
            // Setup test environment
            var env = new TestEnvironment();
            ScrTextCollection.Initialize("/srv/scriptureforge/projects");
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            var associatedPtUser = new SFParatextUser(env.Username01);
            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);

            // SUT
            bool result = env.Service.BackupRepository(user01Secret, ptProjectId);
            Assert.IsTrue(result);
        }

        [Test]
        public void RestoreRepository_Failure()
        {
            // Setup test environment
            var env = new TestEnvironment();
            ScrTextCollection.Initialize("/srv/scriptureforge/projects");
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            var associatedPtUser = new SFParatextUser(env.Username01);
            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
            env.MockFileSystemService.FileExists(Arg.Any<string>()).Throws(new UnauthorizedAccessException());

            // SUT
            bool result = env.Service.RestoreRepository(user01Secret, ptProjectId);
            Assert.IsFalse(result);
            env.MockHgWrapper.DidNotReceiveWithAnyArgs().RestoreRepository(default, default);
            env.MockHgWrapper.DidNotReceiveWithAnyArgs().MarkSharedChangeSetsPublic(default);
        }

        [Test]
        public void RestoreRepository_Missing()
        {
            // Setup test environment
            var env = new TestEnvironment();
            ScrTextCollection.Initialize("/srv/scriptureforge/projects");
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            var associatedPtUser = new SFParatextUser(env.Username01);
            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
            env.MockFileSystemService.FileExists(Arg.Any<string>()).Returns(false);

            // SUT
            bool result = env.Service.RestoreRepository(user01Secret, ptProjectId);
            Assert.IsFalse(result);
            env.MockHgWrapper.DidNotReceiveWithAnyArgs().RestoreRepository(default, default);
            env.MockHgWrapper.DidNotReceiveWithAnyArgs().MarkSharedChangeSetsPublic(default);
        }

        [Test]
        public void RestoreRepository_Success()
        {
            // Setup test environment
            var env = new TestEnvironment();
            ScrTextCollection.Initialize("/srv/scriptureforge/projects");
            UserSecret user01Secret = env.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            var associatedPtUser = new SFParatextUser(env.Username01);
            string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
            env.MockFileSystemService.FileExists(Arg.Any<string>()).Returns(true);

            // SUT
            bool result = env.Service.RestoreRepository(user01Secret, ptProjectId);
            Assert.IsTrue(result);
            env.MockHgWrapper.ReceivedWithAnyArgs().RestoreRepository(default, default);
            env.MockHgWrapper.ReceivedWithAnyArgs().MarkSharedChangeSetsPublic(default);
        }

        private class TestEnvironment
        {
            public readonly string ParatextUserId01 = "paratext01";
            public readonly string ParatextUserId02 = "paratext02";
            public readonly string ParatextUserId03 = "paratext03";
            public readonly string Project01 = "project01";
            public readonly string Project02 = "project02";
            public readonly string Project03 = "project03";
            public readonly string Project04 = "project04";
            public readonly string Resource1Id = "e01f11e9b4b8e338";
            public readonly string Resource2Id = "5e51f89e89947acb";
            public readonly string Resource3Id = "9bb76cd3e5a7f9b4";
            public readonly Dictionary<string, HexId> PTProjectIds = new Dictionary<string, HexId>();
            public readonly string User01 = "user01";
            public readonly string User02 = "user02";
            public readonly string User03 = "user03";
            public readonly string Username01 = "User 01";
            public readonly string Username02 = "User 02";
            public readonly string Username03 = "User 03";
            public readonly string SyncDir = Path.GetTempPath();
            public readonly string ContextBefore = "Context before ";
            public readonly string ContextAfter = " context after.";
            public readonly string AlternateBefore = "Alternate before ";
            public readonly string AlternateAfter = " alternate after.";
            public readonly string ReattachedSelectedText = "reattached text";

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
            public ISFRestClientFactory MockRestClientFactory;
            public ParatextService Service;

            public TestEnvironment()
            {
                MockWebHostEnvironment = Substitute.For<IWebHostEnvironment>();
                MockParatextOptions = Substitute.For<IOptions<ParatextOptions>>();
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
                MockRestClientFactory = Substitute.For<ISFRestClientFactory>();

                DateTime aSecondAgo = DateTime.Now - TimeSpan.FromSeconds(1);
                string accessToken1 =
                    TokenHelper.CreateAccessToken(aSecondAgo - TimeSpan.FromMinutes(20), aSecondAgo, ParatextUserId01);
                string accessToken2 =
                    TokenHelper.CreateAccessToken(aSecondAgo - TimeSpan.FromMinutes(20), aSecondAgo, ParatextUserId02);
                string accessToken3 =
                    TokenHelper.CreateAccessToken(aSecondAgo - TimeSpan.FromMinutes(20), aSecondAgo, ParatextUserId03);
                MockRepository = new MemoryRepository<UserSecret>(new[] {
                    new UserSecret
                    {
                        Id = User01,
                        ParatextTokens = new Tokens { AccessToken = accessToken1, RefreshToken = "refresh_token_1234" },
                    },
                    new UserSecret
                    {
                        Id = User02,
                        ParatextTokens = new Tokens { AccessToken = accessToken2, RefreshToken = "refresh_token_1234" },
                    },
                    new UserSecret
                    {
                        Id = User03,
                        ParatextTokens = new Tokens { AccessToken = accessToken3, RefreshToken = "refresh_token_1234" },
                    },
                });

                RealtimeService = new SFMemoryRealtimeService();

                Service = new ParatextService(MockWebHostEnvironment, MockParatextOptions, MockRepository,
                    RealtimeService, MockExceptionHandler, MockSiteOptions, MockFileSystemService,
                    MockLogger, MockJwtTokenHelper, MockParatextDataHelper, MockInternetSharedRepositorySourceProvider,
                    new TestGuidService(), MockRestClientFactory, MockHgWrapper);
                Service.ScrTextCollection = MockScrTextCollection;
                Service.SharingLogicWrapper = MockSharingLogicWrapper;
                Service.SyncDir = SyncDir;

                PTProjectIds.Add(Project01, HexId.CreateNew());
                PTProjectIds.Add(Project02, HexId.CreateNew());
                PTProjectIds.Add(Project03, HexId.CreateNew());
                PTProjectIds.Add(Project04, HexId.CreateNew());

                MockJwtTokenHelper.GetParatextUsername(Arg.Is<UserSecret>(u => u.Id == User01)).Returns(Username01);
                MockJwtTokenHelper.GetParatextUsername(Arg.Is<UserSecret>(u => u.Id == User02)).Returns(Username02);
                MockJwtTokenHelper.GetParatextUsername(Arg.Is<UserSecret>(u => u.Id == User03)).Returns(Username03);
                MockJwtTokenHelper.GetJwtTokenFromUserSecret(Arg.Any<UserSecret>()).Returns(accessToken1);
                MockJwtTokenHelper.RefreshAccessTokenAsync(Arg.Any<ParatextOptions>(), Arg.Any<Tokens>(),
                    Arg.Any<HttpClient>(), Arg.Any<CancellationToken>())
                    .Returns(Task.FromResult(new Tokens
                    {
                        AccessToken = accessToken1,
                        RefreshToken = "refresh_token_1234"
                    }));
                MockFileSystemService.DirectoryExists(SyncDir).Returns(true);
                RegistryU.Implementation = new DotNetCoreRegistry();
                ScrTextCollection.Implementation = new SFScrTextCollection();
                AddProjectRepository();
            }

            public MockScrText ProjectScrText { get; set; }
            public CommentManager ProjectCommentManager { get; set; }
            public ProjectFileManager ProjectFileManager { get; set; }

            public UserSecret MakeUserSecret(string userSecretId, string username, string paratextUserId)
            {
                DateTime aSecondAgo = DateTime.Now - TimeSpan.FromSeconds(1);
                string accessToken =
                    TokenHelper.CreateAccessToken(aSecondAgo - TimeSpan.FromMinutes(20), aSecondAgo, paratextUserId);
                UserSecret userSecret = new UserSecret
                {
                    Id = userSecretId,
                    ParatextTokens = new Tokens { AccessToken = accessToken, RefreshToken = "refresh_token_1234" }
                };
                return userSecret;
            }

            public ISFRestClientFactory SetRestClientFactory(UserSecret userSecret)
            {
                ISFRestClient mockClient = Substitute.For<ISFRestClient>();
                string json = @"{
    ""resources"": [
        {
            ""languageCode"": ""urw"",
            ""p8z-manifest-checksum"": ""68c1ec33375a8c34"",
            ""languageLDMLId"": ""urw"",
            ""languageName"": ""Sop"",
            ""nameCommon"": ""Sob Jonah and Luke"",
            ""fullname"": ""Sob Jonah and Luke"",
            ""name"": ""SobP15"",
            ""permissions-checksum"": ""1ab119321b305f99"",
            ""id"": """ + this.Resource1Id + @""",
            ""relevance"": {
                ""basic_permissions"": [
                    ""allow_any_user""
                ]
            },
            ""dateUpdated"": ""2017-12-20T17:36:13.021144"",
            ""revision"": 3
        },
        {
            ""languageCode"": ""msy"",
            ""p8z-manifest-checksum"": ""bb0a595a1cf5d8e8"",
            ""languageLDMLId"": ""msy"",
            ""languageName"": ""Aruamu"",
            ""nameCommon"": ""Aruamu New Testament [msy] Papua New Guinea 2004 DBL"",
            ""fullname"": ""Aruamu New Testament [msy] Papua New Guinea 2004 DBL"",
            ""name"": ""AruNT04"",
            ""permissions-checksum"": ""1ab119321b305f99"",
            ""id"": """ + this.Resource2Id + @""",
            ""relevance"": {
                ""basic_permissions"": [
                    ""allow_any_user""
                ]
            },
            ""dateUpdated"": ""2017-12-20T20:11:20.447474"",
            ""revision"": 4
        },
        {
            ""languageCode"": ""eng"",
            ""p8z-manifest-checksum"": ""4328be8bf1ff0164"",
            ""languageLDMLId"": ""en"",
            ""languageName"": ""English"",
            ""nameCommon"": ""Revised Version with Apocrypha 1885, 1895"",
            ""fullname"": ""Revised Version with Apocrypha 1885, 1895"",
            ""name"": ""RV1895"",
            ""permissions-checksum"": ""1ab119321b305f99"",
            ""id"": """ + this.Resource3Id + @""",
            ""relevance"": {
                ""basic_permissions"": [
                    ""allow_any_user""
                ]
            },
            ""dateUpdated"": ""2020-03-20T22:05:54.180663"",
            ""revision"": 6
        }
    ]
}";
                mockClient
                    .Get(Arg.Any<string>())
                    .Returns(json);
                mockClient
                    .GetFile(Arg.Any<string>(), Arg.Any<string>())
                    .Returns(true);
                MockRestClientFactory
                    .Create(Arg.Any<string>(), Arg.Is<UserSecret>(s => s.Id == userSecret.Id))
                    .Returns(mockClient);
                return MockRestClientFactory;
            }

            /// <summary>
            /// If extraSharedRepository, a SharedRepository will be made that does not have corresponding
            /// ProjectMetadata.
            /// </summary>
            public IInternetSharedRepositorySource SetSharedRepositorySource(UserSecret userSecret,
                UserRoles userRoleOnAllThePtProjects, bool extraSharedRepository = false)
            {
                // Set up the XML for the user roles - we could use an XML Document, but this is simpler
                // The schema is from ParatextData.InternalProjectUserAccessData
                // As the logic in PermissionManager is self-contained, this is better than a substitute
                string xml = "<ProjectUserAccess PeerSharing=\"true\">" +
                    $"<User UserName=\"{Username01}\" FirstUser=\"true\" UnregisteredUser=\"false\">" +
                        $"<Role>{userRoleOnAllThePtProjects}</Role><AllBooks>true</AllBooks>" +
                        "<Books /><Permissions /><AutomaticBooks /><AutomaticPermissions />" +
                    "</User>" +
                    $"<User UserName=\"{Username02}\" FirstUser=\"false\" UnregisteredUser=\"false\">" +
                        $"<Role>{userRoleOnAllThePtProjects}</Role><AllBooks>true</AllBooks>" +
                        "<Books /><Permissions /><AutomaticBooks /><AutomaticPermissions />" +
                    "</User>" +
                    $"<User UserName=\"{Username03}\" FirstUser=\"false\" UnregisteredUser=\"false\">" +
                        $"<Role>{userRoleOnAllThePtProjects}</Role><AllBooks>true</AllBooks>" +
                        "<Books /><Permissions /><AutomaticBooks /><AutomaticPermissions />" +
                    "</User>" +
                    "</ProjectUserAccess>";
                PermissionManager sourceUsers = new PermissionManager(xml);
                IInternetSharedRepositorySource mockSource = Substitute.For<IInternetSharedRepositorySource>();
                SharedRepository repo1 = new SharedRepository
                {
                    SendReceiveId = PTProjectIds[Project01],
                    ScrTextName = "P01",
                    SourceUsers = sourceUsers
                };
                SharedRepository repo2 = new SharedRepository
                {
                    SendReceiveId = PTProjectIds[Project02],
                    ScrTextName = "P02",
                    SourceUsers = sourceUsers
                };
                SharedRepository repo3 = new SharedRepository
                {
                    SendReceiveId = PTProjectIds[Project03],
                    ScrTextName = "P03",
                    SourceUsers = sourceUsers
                };
                SharedRepository repo4 = new SharedRepository
                {
                    SendReceiveId = PTProjectIds[Project04],
                    ScrTextName = "P04",
                    SourceUsers = sourceUsers
                };

                ProjectMetadata projMeta1 = GetMetadata(PTProjectIds[Project01].Id, "Full Name " + Project01);
                ProjectMetadata projMeta2 = GetMetadata(PTProjectIds[Project02].Id, "Full Name " + Project02);
                ProjectMetadata projMeta3 = GetMetadata(PTProjectIds[Project03].Id, "Full Name " + Project03);

                var sharedRepositories = new List<SharedRepository> { repo1, repo3, repo2 };
                if (extraSharedRepository)
                {
                    sharedRepositories.Add(repo4);
                }
                mockSource.GetRepositories().Returns(sharedRepositories);
                mockSource.GetProjectsMetaData().Returns(new[] { projMeta1, projMeta2, projMeta3 });

                // An HttpException means that the repo is already unlocked, so any code should be OK with this
                mockSource.When(s => s.UnlockRemoteRepository(Arg.Any<SharedRepository>()))
                    .Do(x => throw HttpException.Create(new WebException(), GenericRequest.Create(new Uri("http://localhost/"))));
                MockInternetSharedRepositorySourceProvider.GetSource(Arg.Is<UserSecret>(s => s.Id == userSecret.Id),
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
                            ParatextId = PTProjectIds[Project01].Id,
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
                                    Chapters =
                                    {
                                        new Chapter { Number = 1, LastVerse = 6, IsValid = true, Permissions = { } }
                                    }
                                },
                                new TextInfo
                                {
                                    BookNum = 41,
                                    Chapters =
                                    {
                                        new Chapter { Number = 1, LastVerse = 3, IsValid = true, Permissions = { } },
                                        new Chapter { Number = 2, LastVerse = 3, IsValid = true, Permissions = { } }
                                    }
                                }
                            }
                        },
                    }));
            }


            public void AddTextDocs(int bookNum, int chapterNum, int verses, string contextBefore, string selectedText,
                bool useThreadSuffix = true)
            {
                TextData[] texts = new TextData[1];
                Delta chapterDelta =
                    GetChapterDelta(chapterNum, verses, contextBefore, selectedText, useThreadSuffix, false);
                texts[0] = new TextData(chapterDelta) { Id = TextData.GetTextDocId(Project01, bookNum, chapterNum) };
                RealtimeService.AddRepository("texts", OTType.RichText, new MemoryRepository<TextData>(texts));
            }

            public void AddNoteThreadData(ThreadComponents[] threadComponents)
            {
                IEnumerable<NoteThread> threads = new NoteThread[0];
                foreach (var comp in threadComponents)
                {
                    string threadId = "thread" + comp.threadNum;
                    string text = "Text selected " + threadId;
                    string selectedText = comp.appliesToVerse ? ContextBefore + text + ContextAfter : text;
                    var noteThread = new NoteThread
                    {
                        Id = "project01:" + threadId,
                        DataId = threadId,
                        ProjectRef = "project01",
                        OwnerRef = "user01",
                        VerseRef = new VerseRefData(40, 1, comp.threadNum),
                        OriginalSelectedText = selectedText,
                        OriginalContextBefore = comp.appliesToVerse ? "" : ContextBefore,
                        Position = comp.appliesToVerse
                            ? new TextAnchor()
                            : new TextAnchor { Start = ContextBefore.Length, Length = text.Length },
                        OriginalContextAfter = comp.appliesToVerse ? "" : ContextAfter,
                        Status = NoteStatus.Todo.InternalValue,
                        TagIcon = $"icon{comp.threadNum}"
                    };
                    List<Note> notes = new List<Note>();
                    for (int i = 1; i <= comp.noteCount; i++)
                    {
                        notes.Add(new Note
                        {
                            DataId = $"n{i}on{threadId}",
                            ThreadId = threadId,
                            OwnerRef = "user02",
                            ExtUserId = "user02",
                            Content = comp.isEdited ? $"<p>{threadId} note {i}: EDITED.</p>" : $"<p>{threadId} note {i}.</p>",
                            SyncUserRef = comp.isNew ? null : "syncuser01",
                            DateCreated = new DateTime(2019, 1, i, 8, 0, 0, DateTimeKind.Utc),
                            TagIcon = $"icon{comp.threadNum}",
                            Deleted = comp.isDeleted,
                            Status = NoteStatus.Todo.InternalValue
                        });
                    }
                    if (comp.reattachedVerseStr != null)
                    {
                        ReattachedThreadInfo rti = GetReattachedThreadInfo(comp.reattachedVerseStr);
                        notes.Add(new Note
                        {
                            DataId = $"reattached{threadId}",
                            ThreadId = threadId,
                            OwnerRef = "user02",
                            ExtUserId = "user02",
                            SyncUserRef = "syncuser01",
                            DateCreated = new DateTime(2019, 1, 20, 8, 0, 0, DateTimeKind.Utc),
                            Status = NoteStatus.Unspecified.InternalValue,
                            Reattached = ReattachedThreadInfoStr(rti)
                        });
                        noteThread.Position = new TextAnchor
                        {
                            Start = rti.contextBefore.Length,
                            Length = rti.selectedText.Length
                        };
                    }
                    noteThread.Notes = notes;
                    if (notes.Count > 0)
                        threads = threads.Append(noteThread);
                }
                RealtimeService.AddRepository("note_threads", OTType.Json0,
                    new MemoryRepository<NoteThread>(threads));
            }

            public Dictionary<int, ChapterDelta> GetChapterDeltasByBook(string projectId, int bookNum,
                int chapters, string contextBefore, string selectedText, bool useThreadSuffix = true,
                bool includeRelatedVerse = false)
            {
                Dictionary<int, ChapterDelta> chapterDeltas = new Dictionary<int, ChapterDelta>();
                int numVersesInChapter = 10;
                for (int i = 1; i <= chapters; i++)
                {
                    Delta delta = GetChapterDelta(i, numVersesInChapter, contextBefore, selectedText, useThreadSuffix,
                        includeRelatedVerse);
                    chapterDeltas.Add(i, new ChapterDelta(i, numVersesInChapter, true, delta));
                }
                return chapterDeltas;
            }

            public string GetUpdateNotesString(string threadId, string user, DateTime date, string content,
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

            public async Task<IEnumerable<IDocument<NoteThread>>> GetNoteThreadDocsAsync(IConnection connection,
                string[] threadIds)
            {
                List<IDocument<NoteThread>> noteThreadDocs = new List<IDocument<NoteThread>>();
                foreach (string threadId in threadIds)
                    noteThreadDocs.Add(await GetNoteThreadDocAsync(connection, threadId));
                return noteThreadDocs;
            }

            public async Task<IDocument<NoteThread>> GetNoteThreadDocAsync(IConnection connection,
                string threadId)
            {
                return await connection.FetchAsync<NoteThread>("project01:" + threadId);
            }

            public string SetupProject(string baseId, ParatextUser associatedPtUser, bool hasEditPermission = true)
            {
                string ptProjectId = PTProjectIds[baseId].Id;
                ProjectScrText = GetScrText(associatedPtUser, ptProjectId, hasEditPermission);

                // We set the file manager here so we can track file manager operations after
                // the ScrText object has been disposed in ParatextService.
                ProjectFileManager = Substitute.For<ProjectFileManager>(ProjectScrText, null);
                ProjectFileManager.IsWritable.Returns(true);
                ProjectScrText.SetFileManager(ProjectFileManager);
                ProjectCommentManager = CommentManager.Get(ProjectScrText);
                MockScrTextCollection.FindById(Arg.Any<string>(), ptProjectId)
                    .Returns(ProjectScrText);
                SetupCommentTags(ProjectScrText);
                return ptProjectId;
            }

            public void AddParatextComments(ThreadComponents[] components)
            {
                XmlDocument doc = new XmlDocument();
                foreach (ThreadComponents comp in components)
                {
                    string threadId = "thread" + comp.threadNum;
                    var associatedPtUser = new SFParatextUser(comp.username);
                    string before = ContextBefore;
                    string after = ContextAfter;
                    string text = "Text selected " + threadId;
                    string selectedText = comp.appliesToVerse ? ContextBefore + text + ContextAfter : text;
                    string verseStr = $"MAT 1:{comp.threadNum}";
                    for (int i = 1; i <= comp.noteCount; i++)
                    {
                        string date = $"2019-01-0{i}T08:00:00.0000000+00:00";
                        XmlElement content = doc.CreateElement("Contents");
                        content.InnerXml = comp.isEdited ? $"<p>{threadId} note {i}: EDITED.</p>" : $"<p>{threadId} note {i}.</p>";
                        if (comp.alternateText == SelectionType.RelatedVerse)
                        {
                            // The alternate text is in a subsequent paragraph with a footnote represented by '*'
                            before = before + text + after + "\n*";
                            after = "";
                            selectedText = "other text in verse";
                        }
                        else if (comp.alternateText == SelectionType.Section)
                        {
                            before = before + text + after;
                            after = "";
                            selectedText = "Section heading text";
                        }
                        ThreadNoteComponents note = new ThreadNoteComponents
                        {
                            status = NoteStatus.Todo,
                            tagsAdded = new[] { comp.threadNum.ToString() }
                        };
                        if (comp.notes != null)
                            note = comp.notes[i - 1];
                        ProjectCommentManager.AddComment(new Paratext.Data.ProjectComments.Comment(associatedPtUser)
                        {
                            Thread = threadId,
                            VerseRefStr = verseStr,
                            SelectedText = selectedText,
                            ContextBefore = comp.appliesToVerse ? "" : before,
                            ContextAfter = comp.appliesToVerse ? "" : after,
                            StartPosition = comp.appliesToVerse ? 0 : before.Length,
                            Contents = content,
                            Date = date,
                            Deleted = comp.isDeleted,
                            Status = note.status,
                            ExternalUser = "user02",
                            TagsAdded = comp.isConflict ? null : note.tagsAdded == null ? null : new[] { note.tagsAdded[0] },
                            Type = comp.isConflict ? NoteType.Conflict : NoteType.Normal
                        });
                    }
                    if (comp.reattachedVerseStr != null)
                    {
                        ReattachedThreadInfo rti = GetReattachedThreadInfo(comp.reattachedVerseStr);
                        ProjectCommentManager.AddComment(new Paratext.Data.ProjectComments.Comment(associatedPtUser)
                        {
                            Thread = threadId,
                            VerseRefStr = verseStr,
                            SelectedText = selectedText,
                            ContextBefore = comp.appliesToVerse ? "" : before,
                            ContextAfter = comp.appliesToVerse ? "" : after,
                            StartPosition = comp.appliesToVerse ? 0 : before.Length,
                            Status = NoteStatus.Unspecified,
                            Date = "2019-01-20T08:00:00.0000000+00:00",
                            Reattached = ReattachedThreadInfoStr(rti)
                        });
                    }
                }
            }

            public MockScrText GetScrText(ParatextUser associatedPtUser, string projectId,
                bool hasEditPermission = true)
            {
                string scrtextDir = Path.Combine(SyncDir, projectId, "target");
                ProjectName projectName = new ProjectName() { ProjectPath = scrtextDir, ShortName = "Proj" };
                var scrText = new MockScrText(associatedPtUser, projectName);
                scrText.CachedGuid = HexId.FromStr(projectId);
                scrText.Permissions.CreateFirstAdminUser();
                scrText.Data.Add("RUT", ruthBookUsfm);
                scrText.Settings.BooksPresentSet = new BookSet("RUT");
                if (!hasEditPermission)
                    scrText.Permissions.SetPermission(null, 8, PermissionSet.Manual, false);
                return scrText;
            }

            public void SetupCommentTags(MockScrText scrText)
            {
                CommentTag[] tags = new CommentTag[10];
                for (int tagId = 0; tagId < 10; tagId++)
                {
                    tags[tagId] = new Paratext.Data.ProjectComments.CommentTag($"tag{tagId}", $"icon{tagId}", tagId);
                }
                CommentTags.CommentTagList list = new CommentTags.CommentTagList();
                list.SerializedData = tags;
                scrText.FileManager.GetXml<CommentTags.CommentTagList>(Arg.Any<string>()).Returns(list);
            }

            public void SetupSuccessfulSendReceive()
            {
                MockSharingLogicWrapper.CreateSharedProject(Arg.Any<string>(), Arg.Any<string>(),
                    Arg.Any<SharedRepositorySource>(), Arg.Any<IEnumerable<SharedRepository>>())
                    .Returns(callInfo => new SharedProject()
                    {
                        SendReceiveId = HexId.FromStr(callInfo.ArgAt<string>(0)),
                        Repository = new SharedRepository
                        {
                            SendReceiveId = HexId.FromStr(callInfo.ArgAt<string>(0)),
                        },
                    });
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

            public ReattachedThreadInfo GetReattachedThreadInfo(string verseStr)
            {
                string startPos = AlternateBefore.Length.ToString();
                return new ReattachedThreadInfo
                {
                    verseStr = verseStr,
                    selectedText = ReattachedSelectedText,
                    startPos = startPos,
                    contextBefore = AlternateBefore,
                    contextAfter = AlternateAfter
                };
            }

            public string ReattachedThreadInfoStr(ReattachedThreadInfo rnt)
            {
                string[] reattachParts = new[] {
                    rnt.verseStr, rnt.selectedText, rnt.startPos, rnt.contextBefore, rnt.contextAfter };
                return string.Join(StringUtils.orcCharacter, reattachParts);
            }

            private Delta GetChapterDelta(int chapterNum, int verses, string contextBefore, string selectedText,
                bool useThreadSuffix, bool includeExtraLastVerseSegment)
            {
                string chapterText = "[ { \"insert\": { \"chapter\": { \"number\": \"" + chapterNum + "\" } }}";
                for (int i = 1; i <= verses; i++)
                {
                    string noteSelectedText = useThreadSuffix ? selectedText + $" thread{i}" : selectedText;
                    string before = contextBefore;
                    string after = ContextAfter;
                    // Make verse 7 with alternate text to optionally use to re-attach to
                    if (i == 7)
                    {
                        before = AlternateBefore;
                        after = AlternateAfter;
                        noteSelectedText = ReattachedSelectedText;
                    }
                    chapterText = chapterText + "," +
                        "{ \"insert\": { \"verse\": { \"number\": \"" + i + "\" } }}, " +
                        "{ \"insert\": \"" + before + noteSelectedText + after + "\", " +
                        "\"attributes\": { \"segment\": \"verse_" + chapterNum + "_" + i + "\" } }";
                    if (i == 8)
                    {
                        // create a new section heading after verse 8
                        chapterText = chapterText + " ," +
                            "{ \"insert\": \"\n\", \"attributes\": { \"para\": { \"style\": \"p\" } }}, " +
                            "{ \"insert\": \"Section heading text\", \"attributes\": { \"segment\": \"s_1\" } }, " +
                            "{ \"insert\": \"\n\", \"attributes\": { \"para\": { \"style\": \"s\" } }}, " +
                            "{ \"insert\": { \"blank\": true }, \"attributes\": { \"segment\": \"p_1\" } }";
                    }
                }
                if (includeExtraLastVerseSegment)
                {
                    // Add a second segment in the last verse (Note the segment name ends with "/p_1").
                    string verseRef = $"verse_{chapterNum}_{verses}";
                    chapterText = chapterText + ", { \"insert\": \"\n\" }," +
                        "{ \"insert\": { \"note\": { \"caller\": \"*\" } }, " +
                        "\"attributes\": { \"segment\": \"" + verseRef + "\" } }," +
                        "{ \"insert\": \"other text in verse\", " +
                        "\"attributes\": { \"segment\": \"" + verseRef + "/p_1\" } }";
                }
                chapterText = chapterText + "]";
                return new Delta(JToken.Parse(chapterText));
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
