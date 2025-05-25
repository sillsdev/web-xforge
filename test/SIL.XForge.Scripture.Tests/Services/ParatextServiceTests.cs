using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Xml;
using System.Xml.Linq;
using ICSharpCode.SharpZipLib.Zip;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Newtonsoft.Json.Linq;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using NSubstitute.ReturnsExtensions;
using NUnit.Framework;
using Paratext.Data;
using Paratext.Data.Languages;
using Paratext.Data.ProjectComments;
using Paratext.Data.ProjectFileAccess;
using Paratext.Data.ProjectSettingsAccess;
using Paratext.Data.RegistryServerAccess;
using Paratext.Data.Repository;
using Paratext.Data.Terms;
using Paratext.Data.Users;
using PtxUtils;
using SIL.Converters.Usj;
using SIL.Scripture;
using SIL.WritingSystems;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.RichText;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Realtime;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class ParatextServiceTests
{
    [Test]
    public void AssemblyDirectory_DoesNotCrash()
    {
        string dir = null;
        // SUT
        Assert.DoesNotThrow(() => dir = ParatextService.AssemblyDirectory, "does not crash");
        Assert.That(string.IsNullOrWhiteSpace(dir), Is.False, "returns something");
    }

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
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
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
            LanguageScript = "Latn",
            LanguageTag = "en",
            ProjectId = "sf_id_" + env.Project01,
            // Not connectable since sf project exists and sf user is on sf project.
            IsConnectable = false,
            // Is connected since is in SF database and user is on project
            IsConnected = true,
        };
        Assert.That(
            repos.Single(project => project.ParatextId == env.PTProjectIds[env.Project01].Id).ToString(),
            Is.EqualTo(expectedProject01.ToString())
        );

        // Repos are returned in alphabetical order by paratext project name.
        List<string> repoList = [.. repos.Select(repo => repo.Name)];
        Assert.That(StringComparer.InvariantCultureIgnoreCase.Compare(repoList[0], repoList[1]), Is.LessThan(0));
        Assert.That(StringComparer.InvariantCultureIgnoreCase.Compare(repoList[1], repoList[2]), Is.LessThan(0));
    }

    [Test]
    public async Task GetProjectsAsync_IncludesNotRegisteredProjects()
    {
        // We should include projects that are not in the registry, like back translation projects
        var env = new TestEnvironment();
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
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
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
        IEnumerable<ParatextProject> projects = await env.Service.GetProjectsAsync(user01Secret);

        ParatextProject project02 = projects.Single(p => p.ParatextId == env.PTProjectIds[env.Project02].Id);
        Assert.That(project02.Name, Is.EqualTo("Full Name " + env.Project02));
    }

    [Test]
    public async Task GetProjectsAsync_ConnectedConnectable()
    {
        var env = new TestEnvironment();
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
        UserSecret user03Secret = TestEnvironment.MakeUserSecret(env.User03, env.Username03, env.ParatextUserId03);
        env.SetSharedRepositorySource(user03Secret, UserRoles.TeamMember);
        SFProject project = env.NewSFProject();
        project.UserRoles = new Dictionary<string, string>
        {
            { env.User01, SFProjectRole.Administrator },
            { env.User02, SFProjectRole.CommunityChecker },
        };
        env.AddProjectRepository(project);
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
                reason2 = "can not re-connect to project",
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
                reason2 = "can connect to existing SF project",
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
                reason2 = "pt admin can start connection to not-yet-existing sf project",
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
                reason2 = "pt non-admin can not start connection to not-yet-existing sf project",
            },
        };

        foreach (var testCase in testCases)
        {
            // Check that assumptions are true.
            Assert.That(
                (await env.RealtimeService.GetRepository<SFProject>().GetAllAsync()).Any(sfProject =>
                    sfProject.ParatextId == testCase.paratextProjectId
                ),
                Is.EqualTo(testCase.sfProjectExists),
                "not set up - whether sf project exists or not"
            );
            if (testCase.sfProjectExists)
            {
                Assert.That(
                    (await env.RealtimeService.GetRepository<SFProject>().GetAllAsync())
                        .Single(sfProject => sfProject.ParatextId == testCase.paratextProjectId)
                        .UserRoles.ContainsKey(testCase.sfUserId),
                    Is.EqualTo(testCase.sfUserIsOnSfProject),
                    "not set up - whether user is on existing sf project or not"
                );
            }
            Assert.That(
                env.MockInternetSharedRepositorySourceProvider.GetSource(
                        testCase.userSecret,
                        string.Empty,
                        string.Empty
                    )
                    .GetRepositories()
                    .FirstOrDefault(sharedRepository => sharedRepository.SendReceiveId.Id == testCase.paratextProjectId)
                    .SourceUsers.GetRole(testCase.ptUsername) == UserRoles.Administrator,
                Is.EqualTo(testCase.ptUserIsAdminOnPtProject),
                "not set up - whether pt user is an admin on pt project"
            );

            // SUT
            ParatextProject resultingProjectToExamine = (
                await env.Service.GetProjectsAsync(testCase.userSecret)
            ).Single(project => project.ParatextId == testCase.paratextProjectId);

            // Assert expectations.
            Assert.That(resultingProjectToExamine.IsConnected, Is.EqualTo(testCase.isConnected), testCase.reason1);
            Assert.That(resultingProjectToExamine.IsConnectable, Is.EqualTo(testCase.isConnectable), testCase.reason2);
        }
    }

    [Test]
    public async Task GetProjectsAsync_IsDraftingEnabled()
    {
        // Setup
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        env.SetSharedRepositorySource(userSecret, UserRoles.Administrator);

        // 1: A back translation with pre-translation disabled
        SFProject project1 = env.NewSFProject(env.Project01);
        project1.TranslateConfig.ProjectType = ProjectType.BackTranslation.ToString();

        // 2: Not a back translation and pre-translation enabled
        SFProject project2 = env.NewSFProject(env.Project02);
        project2.TranslateConfig.PreTranslate = true;

        // 3: Not a back translation and pre-translation disabled
        SFProject project3 = env.NewSFProject(env.Project03);
        env.AddProjectRepository([project1, project2, project3]);

        // SUT
        IReadOnlyList<ParatextProject> projects = await env.Service.GetProjectsAsync(userSecret);
        Assert.AreEqual(3, projects.Count);

        // 1: A back translation with pre-translation disabled
        Assert.IsTrue(projects[0].IsDraftingEnabled);

        // 2: Not a back translation and pre-translation enabled
        Assert.IsTrue(projects[1].IsDraftingEnabled);

        // 3: Not a back translation and pre-translation disabled
        Assert.IsFalse(projects[2].IsDraftingEnabled);
    }

    [Test]
    public async Task GetProjectsAsync_HasDraft()
    {
        // Setup
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        env.SetSharedRepositorySource(userSecret, UserRoles.Administrator);

        // 1: Pre-translation enabled and a draft is present
        SFProject project1 = env.NewSFProject(env.Project01);
        project1.TranslateConfig.PreTranslate = true;
        project1.Texts[0].Chapters[0].HasDraft = true;

        // 2: Pre-translation enabled and no draft is present
        SFProject project2 = env.NewSFProject(env.Project02);
        project2.TranslateConfig.PreTranslate = true;

        // 3: Pre-translation disabled
        SFProject project3 = env.NewSFProject(env.Project03);
        env.AddProjectRepository([project1, project2, project3]);

        // SUT
        IReadOnlyList<ParatextProject> projects = await env.Service.GetProjectsAsync(userSecret);
        Assert.AreEqual(3, projects.Count);

        // 1: Pre-translation enabled and a draft is present
        Assert.IsTrue(projects[0].HasDraft);

        // 2: Pre-translation enabled and no draft is present
        Assert.IsFalse(projects[1].HasDraft);

        // 3: Pre-translation disabled
        Assert.IsFalse(projects[2].HasDraft);
    }

    [Test]
    public async Task GetResourcesAsync_ReturnResources()
    {
        var env = new TestEnvironment();
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
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
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

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
        env.MockExceptionHandler.Received()
            .ReportException(
                Arg.Is<Exception>((Exception e) => e.Message.Contains("inquire about resources and is ignoring error"))
            );
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
        const string id = "1234567890abcdef";
        Assert.That(id.Length, Is.EqualTo(lengthOfDblResourceId), "setup. Use an ID of DBL-Resource-ID-length.");
        // SUT
        Assert.That(env.Service.IsResource(id), Is.True);
    }

    [Test]
    public async Task GetPermissionsAsync_UserResourcePermission()
    {
        // Set up environment
        var env = new TestEnvironment();
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

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
        SFProject project = projects.First();
        project.ParatextId = env.Resource2Id;
        project.UserRoles = new Dictionary<string, string>
        {
            { env.User01, SFProjectRole.Administrator },
            { env.User02, SFProjectRole.CommunityChecker },
        };
        var ptUsernameMapping = new Dictionary<string, string>
        {
            { env.User01, env.Username01 },
            { env.User02, env.Username02 },
        };

        var permissions = await env.Service.GetPermissionsAsync(user01Secret, project, ptUsernameMapping);
        string[] expected = [TextInfoPermission.Read, TextInfoPermission.None];
        Assert.That(permissions.Values, Is.EquivalentTo(expected));
    }

    [Test]
    public async Task GetPermissionsAsync_AllBooksAndAutomaticBooks_HasBookLevelPermission()
    {
        // Set up environment
        var env = new TestEnvironment();
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        // Set up mock project
        var projects = await env.RealtimeService.GetRepository<SFProject>().GetAllAsync();
        SFProject project = projects.First();

        var ptUsernameMapping = new Dictionary<string, string> { { env.User01, env.Username01 } };
        ScrText scrText = env.GetScrText(new SFParatextUser(env.Username01), project.ParatextId);
        scrText.Permissions.SetPermission(env.Username01, 0, PermissionSet.Manual, true);
        // Give User01 automatic permission to Mark but not Matthew
        scrText.Permissions.SetPermission(env.Username01, 41, PermissionSet.Automatic, true);
        env.MockScrTextCollection.FindById(env.Username01, project.ParatextId).Returns(scrText);

        // User01 has permission to Matthew granted explicitly
        Dictionary<string, string> permissions = await env.Service.GetPermissionsAsync(
            user01Secret,
            project,
            ptUsernameMapping,
            40
        );
        string[] expected = [TextInfoPermission.Write, TextInfoPermission.None, TextInfoPermission.None];
        Assert.That(permissions.Values, Is.EquivalentTo(expected));
        // User01 permission to Mark explicitly and automatically
        permissions = await env.Service.GetPermissionsAsync(user01Secret, project, ptUsernameMapping, 41);
        Assert.That(permissions.Values, Is.EquivalentTo(expected));
    }

    [Test]
    public async Task GetPermissionsAsync_AllBooksAndAutomaticBooks_IsConsultant()
    {
        // Set up environment
        var env = new TestEnvironment();
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        // Set up mock project
        var projects = await env.RealtimeService.GetRepository<SFProject>().GetAllAsync();
        SFProject project = projects.First();

        var ptUsernameMapping = new Dictionary<string, string> { { env.User01, env.Username01 } };
        ScrText scrText = env.GetScrText(new SFParatextUser(env.Username01), project.ParatextId);
        // Give User01 automatic permission to all books
        scrText.Permissions.SetPermission(env.Username01, 0, PermissionSet.Automatic, true);
        // Make User01 a consultant
        scrText.Permissions.ChangeUserRole(env.Username01, UserRoles.Consultant);
        env.MockScrTextCollection.FindById(env.Username01, project.ParatextId).Returns(scrText);

        // SUT
        Dictionary<string, string> permissions = await env.Service.GetPermissionsAsync(
            user01Secret,
            project,
            ptUsernameMapping,
            40
        );

        // Ensure the user has read only access to Matthew and Mark
        string[] expected = [TextInfoPermission.Read, TextInfoPermission.None, TextInfoPermission.None];
        Assert.That(permissions.Values, Is.EquivalentTo(expected));
    }

    [Test]
    public async Task GetPermissionsAsync_AutomaticBooks_HasBookLevelPermission()
    {
        // Set up environment
        var env = new TestEnvironment();
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        // Set up mock project
        var projects = await env.RealtimeService.GetRepository<SFProject>().GetAllAsync();
        SFProject project = projects.First();

        var ptUsernameMapping = new Dictionary<string, string> { { env.User01, env.Username01 } };
        ScrText scrText = env.GetScrText(new SFParatextUser(env.Username01), project.ParatextId);
        scrText.Permissions.SetPermission(env.Username01, 0, PermissionSet.Manual, false);
        // Give automatic permission to User01 to Mark but not Matthew
        scrText.Permissions.SetPermission(env.Username01, 41, PermissionSet.Automatic, true);
        env.MockScrTextCollection.FindById(env.Username01, project.ParatextId).Returns(scrText);

        // User01 does not have permission to Matthew
        Dictionary<string, string> permissions = await env.Service.GetPermissionsAsync(
            user01Secret,
            project,
            ptUsernameMapping,
            40
        );
        string[] expected = [TextInfoPermission.Read, TextInfoPermission.None, TextInfoPermission.None];
        Assert.That(permissions.Values, Is.EquivalentTo(expected));
        // User01 has permission to Mark automatically
        permissions = await env.Service.GetPermissionsAsync(user01Secret, project, ptUsernameMapping, 41);
        expected = [TextInfoPermission.Write, TextInfoPermission.None, TextInfoPermission.None];
        Assert.That(permissions.Values, Is.EquivalentTo(expected));
    }

    [Test]
    public async Task GetResourcePermissionAsync_UserNoResourcePermission()
    {
        // Set up environment
        var env = new TestEnvironment();
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        // Set up mock REST client to return a successful GET request
        env.SetRestClientFactory(user01Secret);

        var paratextId = "resid_is_16_char";
        var permission = await env.Service.GetResourcePermissionAsync(paratextId, env.User01, CancellationToken.None);
        Assert.That(permission, Is.EqualTo(TextInfoPermission.None));
    }

    [Test]
    public async Task GetResourcePermissionAsync_UserNoResourcePermissionWhenUnauthorized()
    {
        // Set up environment
        var env = new TestEnvironment();
        env.AddUserRepository([new User { Id = env.User01, AuthId = "auth01" }]);
        env.MockAuthService.GetParatextTokensAsync("auth01", CancellationToken.None)
            .Returns(Task.FromResult(new Tokens()));
        env.MockJwtTokenHelper.RefreshAccessTokenAsync(
                Arg.Any<ParatextOptions>(),
                Arg.Any<Tokens>(),
                Arg.Any<HttpClient>(),
                CancellationToken.None
            )
            .Throws(new UnauthorizedAccessException());

        // SUT
        var paratextId = env.Resource2Id;
        var permission = await env.Service.GetResourcePermissionAsync(paratextId, env.User01, CancellationToken.None);

        Assert.That(permission, Is.EqualTo(TextInfoPermission.None));
        await env
            .MockJwtTokenHelper.Received()
            .RefreshAccessTokenAsync(
                Arg.Any<ParatextOptions>(),
                Arg.Any<Tokens>(),
                Arg.Any<HttpClient>(),
                CancellationToken.None
            );
    }

    [Test]
    public async Task GetResourcePermissionAsync_UserResourcePermission()
    {
        // Set up environment
        var env = new TestEnvironment();
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
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
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        // Books 1 thru 3.
        env.ProjectScrText.Settings.BooksPresentSet = new BookSet(1, 3);

        IReadOnlyList<int> result = env.Service.GetBookList(userSecret, ptProjectId);
        Assert.That(result.Count, Is.EqualTo(3));
        Assert.That(result, Is.EquivalentTo(new[] { 1, 2, 3 }));
    }

    [Test]
    public void GetBookText_OverrideUSFM()
    {
        const string ruthBookUsfm =
            "\\id RUT - ProjectNameHere\n \\c 1\n"
            + "\\v 1 Updated Verse 1 here.\n"
            + "\\v 2 Updated Verse 2 here.\n"
            + "\\v 3 New Verse 3 here.";
        const string ruthBookUsx =
            "<usx version=\"3.0\">\r\n  <book code=\"RUT\" style=\"id\">- ProjectNameHere"
            + "</book>\r\n  <chapter number=\"1\" style=\"c\" />\r\n  <verse number=\"1\" style=\"v\" />"
            + "Updated Verse 1 here. <verse number=\"2\" style=\"v\" />Updated Verse 2 here. "
            + "<verse number=\"3\" style=\"v\" />New Verse 3 here.</usx>";

        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
        TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        // SUT
        string result = env.Service.GetBookText(null, ptProjectId, 8, ruthBookUsfm);
        Assert.That(result, Is.EqualTo(ruthBookUsx));
    }

    [Test]
    public void GetBookText_OverrideUSFM_WithVariantBookId()
    {
        const string ruthBookUsfm =
            "\\id Rut - ProjectNameHere\n \\c 1\n"
            + "\\v 1 Updated Verse 1 here.\n"
            + "\\v 2 Updated Verse 2 here.\n"
            + "\\v 3 New Verse 3 here.";
        const string ruthBookUsx =
            "<usx version=\"3.0\">\r\n  <book code=\"RUT\" style=\"id\">- ProjectNameHere"
            + "</book>\r\n  <chapter number=\"1\" style=\"c\" />\r\n  <verse number=\"1\" style=\"v\" />"
            + "Updated Verse 1 here. <verse number=\"2\" style=\"v\" />Updated Verse 2 here. "
            + "<verse number=\"3\" style=\"v\" />New Verse 3 here.</usx>";

        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
        TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        // SUT
        string result = env.Service.GetBookText(null, ptProjectId, 8, ruthBookUsfm);
        Assert.That(result, Is.EqualTo(ruthBookUsx));
    }

    [Test]
    public void GetBookText_Works()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
        TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        // SUT
        string result = env.Service.GetBookText(null, ptProjectId, 8);
        Assert.That(result, Is.EqualTo(env.RuthBookUsxString));
    }

    [Test]
    public void GetBookText_NoSuchPtProjectKnown()
    {
        var env = new TestEnvironment();
        string ptProjectId = env.PTProjectIds[env.Project01].Id;
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
        env.MockScrTextCollection.FindById(env.Username01, ptProjectId).Returns(_ => null);

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
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        const int ruthBookNum = 8;

        JToken token1 = JToken.Parse("{\"insert\": { \"chapter\": { \"number\": \"1\", \"style\": \"c\" } } }");
        JToken token2 = JToken.Parse("{\"insert\": { \"verse\": { \"number\": \"1\", \"style\": \"v\" } } }");
        JToken token3 = JToken.Parse(
            "{\"insert\": \"Verse 1 here. \", \"attributes\": { \"segment\": \"verse_1_1\" } }"
        );
        JToken token4 = JToken.Parse("{\"insert\": { \"verse\": { \"number\": \"2\", \"style\": \"v\" } } }");
        JToken token5 = JToken.Parse(
            "{\"insert\": \"Verse 2 here. THIS PART IS EDITED!\"," + "\"attributes\": { \"segment\": \"verse_1_2\" } }"
        );

        TextData data = new TextData(new Delta(new[] { token1, token2, token3, token4, token5 }));
        var mapper = new DeltaUsxMapper(
            new TestGuidService(),
            Substitute.For<ILogger<DeltaUsxMapper>>(),
            Substitute.For<IExceptionHandler>()
        );
        var newDocUsx = mapper.ToUsx(env.RuthBookUsx, new List<ChapterDelta> { new ChapterDelta(1, 2, true, data) });

        int booksUpdated = await env.Service.PutBookText(userSecret, ptProjectId, ruthBookNum, newDocUsx);
        env.ProjectFileManager.Received(1).WriteFileCreatingBackup(Arg.Any<string>(), Arg.Any<Action<string>>());
        Assert.That(booksUpdated, Is.EqualTo(1));

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
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        const int ruthBookNum = 8;

        // SUT
        int booksUpdated = await env.Service.PutBookText(userSecret, ptProjectId, ruthBookNum, env.RuthBookUsx);

        // Make sure only one ScrText was loaded
        env.MockScrTextCollection.Received(1).FindById(env.Username01, ptProjectId);
        Assert.That(booksUpdated, Is.EqualTo(1));

        // See if there is a message for the user updating the book
        string logMessage = string.Format(
            "{0} updated {1} in {2}.",
            env.User01,
            Canon.BookNumberToEnglishName(ruthBookNum),
            env.ProjectScrText.Name
        );
        env.MockLogger.AssertHasEvent((LogEvent logEvent) => logEvent.Message == logMessage);
    }

    [Test]
    public async Task PutBookText_UpdatesTheBookIfAllSameAuthor()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        // should be able to edit the book text even if the admin user does not have permission
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser, hasEditPermission: false);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        const int ruthBookNum = 8;
        var chapterAuthors = new Dictionary<int, string> { { 1, env.User01 }, { 2, env.User01 } };

        // SUT
        int booksUpdated = await env.Service.PutBookText(
            userSecret,
            ptProjectId,
            ruthBookNum,
            env.RuthBookUsx,
            chapterAuthors
        );

        // Make sure only one ScrText was loaded
        env.MockScrTextCollection.Received(1).FindById(env.Username01, ptProjectId);
        Assert.That(booksUpdated, Is.EqualTo(1));

        // See if there is a message for the user updating the book
        string logMessage = string.Format(
            "{0} updated {1} in {2}.",
            env.User01,
            Canon.BookNumberToEnglishName(ruthBookNum),
            env.ProjectScrText.Name
        );
        env.MockLogger.AssertHasEvent((LogEvent logEvent) => logEvent.Message == logMessage);
    }

    [Test]
    public async Task PutBookText_UpdatesTheChapterIfDifferentAuthors()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        // should be able to edit the book text even if the admin user does not have permission
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser, hasEditPermission: false);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        TestEnvironment.MakeUserSecret(env.User02, env.Username02, env.ParatextUserId02);

        const int ruthBookNum = 8;
        var chapterAuthors = new Dictionary<int, string> { { 1, env.User01 }, { 2, env.User02 } };

        // SUT
        int booksUpdated = await env.Service.PutBookText(
            userSecret,
            ptProjectId,
            ruthBookNum,
            env.RuthBookUsx,
            chapterAuthors
        );

        // Make sure two ScrTexts were loaded
        env.MockScrTextCollection.Received(1).FindById(env.Username01, ptProjectId);
        env.MockScrTextCollection.Received(1).FindById(env.Username02, ptProjectId);
        Assert.That(booksUpdated, Is.EqualTo(1));

        // See if there is a message for the user updating the chapter
        string logMessage = string.Format(
            "{0} updated chapter {1} of {2} in {3}.",
            env.User01,
            1,
            Canon.BookNumberToEnglishName(ruthBookNum),
            env.ProjectScrText.Name
        );
        env.MockLogger.AssertHasEvent((LogEvent logEvent) => logEvent.Message == logMessage);
    }

    [Test]
    public void GetNotes_RetrievesNotes()
    {
        int ruthBookNum = 8;
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        env.ProjectCommentManager.AddComment(
            new Paratext.Data.ProjectComments.Comment(associatedPtUser)
            {
                Thread = "Answer_dataId0123",
                VerseRefStr = "RUT 1:1",
            }
        );
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
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        DateTime date = DateTime.Now; // This must be consistent as it is a part of the comment id

        // Add new comment
        string threadId = "Answer_0123";
        string content = "Content for comment to update.";
        string verseRef = "RUT 1:1";
        XElement updateNotesXml = TestEnvironment.GetUpdateNotesXml(threadId, env.User01, date, content, verseRef);
        var syncMetricInfo = env.Service.PutNotes(userSecret, ptProjectId, updateNotesXml);

        CommentThread thread = env.ProjectCommentManager.FindThread(threadId);
        Assert.That(thread.Comments.Count, Is.EqualTo(1));
        var comment = thread.Comments.First();
        Assert.That(comment.VerseRefStr, Is.EqualTo(verseRef));
        Assert.That(comment.User, Is.EqualTo(env.User01));
        Assert.That(comment.Contents.InnerText, Is.EqualTo(content));
        Assert.That(syncMetricInfo, Is.EqualTo(new SyncMetricInfo(added: 1, deleted: 0, updated: 0)));

        // Edit a comment
        content = "Edited: Content for comment to update.";
        updateNotesXml = TestEnvironment.GetUpdateNotesXml(threadId, env.User01, date, content, verseRef);
        syncMetricInfo = env.Service.PutNotes(userSecret, ptProjectId, updateNotesXml);

        Assert.That(thread.Comments.Count, Is.EqualTo(1));
        comment = thread.Comments.First();
        Assert.That(comment.Contents.InnerText, Is.EqualTo(content));
        Assert.That(syncMetricInfo, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 1)));

        // Delete a comment
        updateNotesXml = TestEnvironment.GetUpdateNotesXml(threadId, env.User01, date, content, verseRef, true);
        syncMetricInfo = env.Service.PutNotes(userSecret, ptProjectId, updateNotesXml);

        thread = env.ProjectCommentManager.FindThread(threadId);
        Assert.That(thread, Is.Null);
        Assert.That(syncMetricInfo, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 1, updated: 0)));

        // PT username is not written to server logs
        env.MockLogger.AssertNoEvent((LogEvent logEvent) => logEvent.Message.Contains(env.Username01));
    }

    [Test]
    public void PutNotes_RethrowsErrors()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        DateTime date = DateTime.Now; // This must be consistent as it is a part of the comment id

        // Configure the Paratext data helper to throw an error
        var exception = new UnauthorizedAccessException();
        env.MockParatextDataHelper.When(pd => pd.CommitVersionedText(Arg.Any<ScrText>(), Arg.Any<string>()))
            .Throws(exception);

        // Add new comment
        const string threadId = "Answer_0123";
        const string content = "Content for comment to update.";
        const string verseRef = "RUT 1:1";
        XElement updateNotesXml = TestEnvironment.GetUpdateNotesXml(threadId, env.User01, date, content, verseRef);
        Assert.Throws<UnauthorizedAccessException>(() => env.Service.PutNotes(userSecret, ptProjectId, updateNotesXml));

        // Ensure that the error has logged too
        env.MockLogger.AssertHasEvent(logEvent => logEvent.Exception == exception);
    }

    [Test]
    public async Task GetNoteThreadChanges_NotePositionUpdated()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        env.AddTextDocs(40, 1, 6, "Context before ", "Text selected");

        env.AddNoteThreadData([new ThreadComponents { threadNum = 1, noteCount = 1 }]);
        env.AddParatextComments(
            [
                new ThreadComponents
                {
                    threadNum = 1,
                    noteCount = 1,
                    username = env.Username01,
                },
                new ThreadComponents
                {
                    threadNum = 2,
                    noteCount = 1,
                    username = env.Username01,
                    appliesToVerse = true,
                },
            ]
        );

        await using IConnection conn = await env.RealtimeService.ConnectAsync();
        IEnumerable<IDocument<NoteThread>> noteThreadDocs = await TestEnvironment.GetNoteThreadDocsAsync(
            conn,
            ["dataId1"]
        );
        Dictionary<string, ParatextUserProfile> ptProjectUsers = new Dictionary<string, ParatextUserProfile>
        {
            {
                env.Username01,
                new ParatextUserProfile { OpaqueUserId = "syncuser01", Username = env.Username01 }
            },
        };

        string contextBefore = "Context before changed ";
        string selectionText = "Text selected changed";
        Dictionary<int, ChapterDelta> chapterDeltas = env.GetChapterDeltasByBook(
            1,
            contextBefore,
            selectionText,
            false
        );

        IEnumerable<NoteThreadChange> changes = env.Service.GetNoteThreadChanges(
            userSecret,
            ptProjectId,
            40,
            noteThreadDocs,
            chapterDeltas,
            ptProjectUsers
        );
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

    [Test]
    public async Task GetNoteThreadChanges_NotePositionDefaulted()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        env.AddTextDocs(40, 1, 6, "Context before ", "Text selection", false);

        env.AddNoteThreadData([new ThreadComponents { threadNum = 1, noteCount = 1 }]);
        env.AddParatextComments(
            [
                new ThreadComponents
                {
                    threadNum = 1,
                    noteCount = 1,
                    username = env.Username01,
                },
            ]
        );

        await using IConnection conn = await env.RealtimeService.ConnectAsync();
        IEnumerable<IDocument<NoteThread>> noteThreadDocs = await TestEnvironment.GetNoteThreadDocsAsync(
            conn,
            ["dataId1"]
        );
        Dictionary<string, ParatextUserProfile> ptProjectUsers = new Dictionary<string, ParatextUserProfile>
        {
            {
                env.Username01,
                new ParatextUserProfile { OpaqueUserId = "syncuser01", Username = env.Username01 }
            },
        };
        Dictionary<int, ChapterDelta> chapterDeltas = env.GetChapterDeltasByBook(
            1,
            "Unrecognizable context ",
            "unrecognizable selection",
            false
        );

        IEnumerable<NoteThreadChange> changes = env.Service.GetNoteThreadChanges(
            userSecret,
            ptProjectId,
            40,
            noteThreadDocs,
            chapterDeltas,
            ptProjectUsers
        );
        Assert.That(changes.Count, Is.EqualTo(1));

        // Vigorous text changes, the note defaults to the start
        NoteThreadChange change = changes.First(c => c.ThreadId == "thread1");
        TextAnchor expected = new TextAnchor { Start = 0, Length = 0 };
        Assert.That(change.Position, Is.EqualTo(expected));
    }

    [Test]
    public async Task GetNoteThreadChanges_RetrievesChanges()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        env.AddTextDocs(40, 1, 10, "Context before ", "Text selected");

        ThreadNoteComponents user1Note = new ThreadNoteComponents { ownerRef = env.User01, tagsAdded = ["1"] };
        ThreadNoteComponents user1NoteNoTag = new ThreadNoteComponents { ownerRef = env.User01 };
        ThreadNoteComponents thread8Note = new ThreadNoteComponents
        {
            ownerRef = env.User01,
            content = "Admin comment no xml tags.",
            assignedPTUser = CommentThread.unassignedUser,
        };
        env.AddNoteThreadData(
            [
                new ThreadComponents
                {
                    threadNum = 1,
                    noteCount = 1,
                    notes = [user1Note],
                },
                new ThreadComponents
                {
                    threadNum = 2,
                    noteCount = 1,
                    notes = [user1Note],
                },
                new ThreadComponents
                {
                    threadNum = 4,
                    noteCount = 3,
                    notes = [user1Note, user1NoteNoTag, user1NoteNoTag],
                    deletedNotes = [false, true, false],
                },
                new ThreadComponents
                {
                    threadNum = 5,
                    noteCount = 2,
                    notes = [user1Note, user1NoteNoTag],
                    deletedNotes = [true, false],
                },
                new ThreadComponents
                {
                    threadNum = 7,
                    noteCount = 1,
                    notes = [user1Note],
                },
                new ThreadComponents
                {
                    threadNum = 8,
                    noteCount = 1,
                    notes = [thread8Note],
                },
                new ThreadComponents
                {
                    threadNum = 9,
                    noteCount = 3,
                    notes = [user1Note, user1Note, user1Note],
                },
            ]
        );
        env.AddParatextComments(
            [
                new ThreadComponents
                {
                    threadNum = 1,
                    noteCount = 1,
                    username = env.Username01,
                    notes = [user1Note],
                    isEdited = true,
                },
                new ThreadComponents
                {
                    threadNum = 2,
                    noteCount = 1,
                    username = env.Username01,
                    notes = [user1Note],
                    deletedNotes = [true],
                },
                new ThreadComponents
                {
                    threadNum = 3,
                    noteCount = 1,
                    username = env.Username02,
                    notes = [user1Note],
                },
                new ThreadComponents
                {
                    threadNum = 4,
                    noteCount = 1,
                    username = env.Username01,
                    notes = [user1Note],
                },
                new ThreadComponents
                {
                    threadNum = 6,
                    noteCount = 1,
                    isConflict = true,
                    notes = [user1Note],
                },
                new ThreadComponents
                {
                    threadNum = 7,
                    noteCount = 2,
                    username = env.Username01,
                    notes = [user1Note, user1NoteNoTag],
                },
                new ThreadComponents
                {
                    threadNum = 8,
                    noteCount = 1,
                    username = env.Username01,
                    notes = [thread8Note],
                },
                new ThreadComponents
                {
                    threadNum = 9,
                    noteCount = 3,
                    username = env.Username01,
                    notes = [user1Note, user1NoteNoTag, user1NoteNoTag],
                },
            ]
        );
        await using IConnection conn = await env.RealtimeService.ConnectAsync();
        IEnumerable<IDocument<NoteThread>> noteThreadDocs = await TestEnvironment.GetNoteThreadDocsAsync(
            conn,
            ["dataId1", "dataId2", "dataId4", "dataId5", "dataId7", "dataId8", "dataId9"]
        );
        Dictionary<string, ParatextUserProfile> ptProjectUsers = new[]
        {
            new ParatextUserProfile { OpaqueUserId = "syncuser01", Username = env.Username01 },
        }.ToDictionary(u => u.Username);
        Dictionary<int, ChapterDelta> chapterDeltas = env.GetChapterDeltasByBook(1, "Context before ", "Text selected");

        // SUT
        IEnumerable<NoteThreadChange> changes = env.Service.GetNoteThreadChanges(
            userSecret,
            ptProjectId,
            40,
            noteThreadDocs,
            chapterDeltas,
            ptProjectUsers
        );
        Assert.That(changes.Count, Is.EqualTo(8));
        Assert.That(changes.FirstOrDefault(c => c.ThreadId == "thread8"), Is.Null);

        // Edited comment
        NoteThreadChange change01 = changes.Where(c => c.ThreadId == "thread1").Single();
        Assert.That(
            change01.ThreadChangeToString(),
            Is.EqualTo("Context before Text selected thread1 context after.-MAT 1:1")
        );
        Assert.That(change01.NotesUpdated.Count, Is.EqualTo(1));
        string expected1 = "thread1-syncuser01-thread1 note 1: EDITED.-tag:1";
        Assert.That(change01.NotesUpdated[0].NoteToString(), Is.EqualTo(expected1));

        // Deleted comment
        NoteThreadChange change02 = changes.Where(c => c.ThreadId == "thread2").Single();
        Assert.That(
            change02.ThreadChangeToString(),
            Is.EqualTo("Context before Text selected thread2 context after.-MAT 1:2")
        );
        Assert.That(change02.NotesDeleted.Count, Is.EqualTo(1));
        string expected2 = "thread2-syncuser01-thread2 note 1.-deleted-tag:1";
        Assert.That(change02.NotesDeleted[0].NoteToString(), Is.EqualTo(expected2));

        // Added comment on new thread and User 02 added as new pt user
        NoteThreadChange change03 = changes.Where(c => c.ThreadId == "thread3").Single();
        Assert.That(
            change03.ThreadChangeToString(),
            Is.EqualTo("Context before Text selected thread3 context after.-Start:15-Length:21-MAT 1:3")
        );
        Assert.That(change03.NotesAdded.Count, Is.EqualTo(1));
        string expected3 = "thread3-syncuser04-thread3 note 1.-tag:1";
        Assert.That(change03.NotesAdded[0].NoteToString(), Is.EqualTo(expected3));

        // Permanently removed comment
        NoteThreadChange change04 = changes.Where(c => c.ThreadId == "thread4").Single();
        Assert.That(
            change04.ThreadChangeToString(),
            Is.EqualTo("Context before Text selected thread4 context after.-MAT 1:4")
        );
        // only remove the note that is not already marked deleted
        Assert.That(change04.NoteIdsRemoved, Is.EquivalentTo(new[] { "n3onthread4" }));

        // Permanently removed thread
        NoteThreadChange change05 = changes.Where(c => c.ThreadId == "thread5").Single();
        Assert.That(
            change05.ThreadChangeToString(),
            Is.EqualTo("Context before Text selected thread5 context after.-MAT 1:5")
        );
        Assert.That(change05.NoteIdsRemoved, Is.EquivalentTo(new[] { "n2onthread5" }));

        // Added conflict comment
        NoteThreadChange change06 = changes.Where(c => c.ThreadId == "thread6").Single();
        Assert.That(
            change06.ThreadChangeToString(),
            Is.EqualTo("Context before Text selected thread6 context after.-Start:15-Length:21-MAT 1:6")
        );
        string expected6 = "thread6--thread6 note 1.-tag:-1";
        Assert.That(change06.NotesAdded[0].NoteToString(), Is.EqualTo(expected6));

        // Added comment on existing thread
        NoteThreadChange change07 = changes.Where(c => c.ThreadId == "thread7").Single();
        string expected7 = "thread7-syncuser01-thread7 note 2.";
        Assert.That(change07.NotesAdded[0].NoteToString(), Is.EqualTo(expected7));

        // Removed tag icon on repeated todo notes
        NoteThreadChange change08 = changes.Where(c => c.ThreadId == "thread9").Single();
        Assert.That(change08.NotesUpdated[0].DataId, Is.EqualTo("n2onthread9"));
        Assert.That(change08.NotesUpdated[0].TagId, Is.EqualTo(null));
        Assert.That(change08.NotesUpdated[1].DataId, Is.EqualTo("n3onthread9"));
        Assert.That(change08.NotesUpdated[1].TagId, Is.EqualTo(null));

        // User 02 is added to the list of Paratext Users when thread3 is added to note thread docs
        // No users should be added from the new thread6 change which has no paratext user
        Assert.That(ptProjectUsers.Keys, Is.EquivalentTo(new[] { env.Username01, env.Username02 }));
    }

    [Test]
    public async Task GetNoteThreadChanges_ChangesWithEmptyValues()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string paratextId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        string content1a = "";
        string content1b = "<p>First paragraph.</p><p>Second paragraph.</p>";
        string content2a = "<p>First paragraph.</p><p>Second paragraph.</p>";
        string content2b = "";
        string content3 = "";

        var note1a = new ThreadNoteComponents { content = content1a, tagsAdded = ["1"] };
        var note2a = new ThreadNoteComponents { content = content2a };
        var note3a = new ThreadNoteComponents { content = content3 };
        env.AddNoteThreadData(
            [
                new ThreadComponents
                {
                    threadNum = 1,
                    noteCount = 3,
                    notes = [note1a, note2a, note3a],
                },
            ]
        );

        var note1b = new ThreadNoteComponents
        {
            content = content1b,
            ownerRef = env.User01,
            tagsAdded = ["1"],
        };
        var note2b = new ThreadNoteComponents { content = content2b, ownerRef = env.User01 };
        var note3b = new ThreadNoteComponents { content = content3, ownerRef = env.User01 };
        env.AddParatextComments(
            [
                new ThreadComponents
                {
                    threadNum = 1,
                    noteCount = 3,
                    username = env.Username01,
                    notes = [note1b, note2b, note3b],
                },
            ]
        );

        Dictionary<string, ParatextUserProfile> ptProjectUsers = new Dictionary<string, ParatextUserProfile>
        {
            {
                env.Username01,
                new ParatextUserProfile
                {
                    Username = env.Username01,
                    OpaqueUserId = "syncuser01",
                    SFUserId = env.User01,
                }
            },
        };
        await using IConnection conn = await env.RealtimeService.ConnectAsync();
        IEnumerable<IDocument<NoteThread>> noteThreadDocs = await TestEnvironment.GetNoteThreadDocsAsync(
            conn,
            ["dataId1"]
        );
        Dictionary<int, ChapterDelta> chapterDeltas = env.GetChapterDeltasByBook(1, env.ContextBefore, "Text selected");

        IEnumerable<NoteThreadChange> changes = env.Service.GetNoteThreadChanges(
            userSecret,
            paratextId,
            40,
            noteThreadDocs,
            chapterDeltas,
            ptProjectUsers
        );
        Assert.That(changes.Count, Is.EqualTo(1));
        NoteThreadChange change1 = changes.Single();
        Assert.That(
            change1.ThreadChangeToString(),
            Is.EqualTo("Context before Text selected thread1 context after.-MAT 1:1")
        );
        Assert.That(change1.NotesUpdated.Count, Is.EqualTo(2));
        Assert.That(
            change1.NotesUpdated[0].NoteToString(),
            Is.EqualTo("thread1-syncuser01-<p>First paragraph.</p><p>Second paragraph.</p>-tag:1")
        );
        Assert.That(change1.NotesUpdated[1].NoteToString(), Is.EqualTo("thread1-syncuser01-"));
    }

    [Test]
    public void GetNoteThreadChanges_AddsNoteWithXmlFormatting()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string paratextId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        const string formattedContent = "Text with <bold>bold</bold> and <italics>italics</italics> styles.";
        const string nonFormattedContent = "Text without formatting";
        const string formattedContentInParagraph =
            "<p>Text with <bold>bold</bold> style.</p><p>Text with<italics>italics</italics> style.</p>";
        const string nonFormattedContentInParagraph = "<p>Text without formatting.</p><p>Second paragraph.</p>";
        const string whitespaceInContent = "<p>First paragraph.</p>\n<p>Second paragraph.</p>";
        const string reviewerAuthorParagraph = "<p sf-user-label=\"true\">[testuser - Scripture Forge]</p>";
        const string reviewerContentParagraph = "<p>Test <bold>entity parsing</bold> with 1&amp;2 John!</p>";
        const string reviewerContent = reviewerAuthorParagraph + reviewerContentParagraph;
        var note1 = new ThreadNoteComponents { content = formattedContent };
        var note2 = new ThreadNoteComponents { content = nonFormattedContent };
        var note3 = new ThreadNoteComponents { content = formattedContentInParagraph };
        var note4 = new ThreadNoteComponents { content = nonFormattedContentInParagraph };
        var note5 = new ThreadNoteComponents { content = whitespaceInContent };
        var note6 = new ThreadNoteComponents { content = reviewerContent };
        env.AddParatextComments(
            [
                new ThreadComponents
                {
                    threadNum = 1,
                    noteCount = 6,
                    username = env.Username01,
                    notes = [note1, note2, note3, note4, note5, note6],
                },
            ]
        );

        IDocument<NoteThread>[] noteThreadDocs = [];
        Dictionary<int, ChapterDelta> chapterDeltas = env.GetChapterDeltasByBook(1, env.ContextBefore, "Text selected");
        Dictionary<string, ParatextUserProfile> ptProjectUsers = new Dictionary<string, ParatextUserProfile>
        {
            {
                env.Username01,
                new ParatextUserProfile
                {
                    SFUserId = env.User01,
                    OpaqueUserId = "syncuser01",
                    Username = env.Username01,
                }
            },
        };
        IEnumerable<NoteThreadChange> changes = env.Service.GetNoteThreadChanges(
            userSecret,
            paratextId,
            40,
            noteThreadDocs,
            chapterDeltas,
            ptProjectUsers
        );
        Assert.That(changes.Count, Is.EqualTo(1));
        NoteThreadChange change1 = changes.Single();
        const string expected1 = $"thread1-syncuser01-{formattedContent}";
        Assert.That(change1.NotesAdded[0].NoteToString(), Is.EqualTo(expected1));
        const string expected2 = $"thread1-syncuser01-{nonFormattedContent}";
        Assert.That(change1.NotesAdded[1].NoteToString(), Is.EqualTo(expected2));
        const string expected3 = $"thread1-syncuser01-{formattedContentInParagraph}";
        Assert.That(change1.NotesAdded[2].NoteToString(), Is.EqualTo(expected3));
        const string expected4 = $"thread1-syncuser01-{nonFormattedContentInParagraph}";
        Assert.That(change1.NotesAdded[3].NoteToString(), Is.EqualTo(expected4));
        // whitespace does not get processed as a node in xml, so it gets omitted from note content
        string expected5 = $"thread1-syncuser01-{whitespaceInContent.Replace("\n", string.Empty)}";
        Assert.That(change1.NotesAdded[4].NoteToString(), Is.EqualTo(expected5));
        string expected6 = $"thread1-syncuser01-{Regex.Replace(reviewerContentParagraph, "</?p>", string.Empty)}";
        Assert.That(change1.NotesAdded[5].NoteToString(), Is.EqualTo(expected6));
    }

    [Test]
    public async Task GetNoteThreadChanges_DiscardsPTChangesToCommenterNote()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string paratextId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        var notes = new[]
        {
            new ThreadNoteComponents
            {
                ownerRef = env.User05,
                tagsAdded = ["2"],
                content = "original content",
            },
            new ThreadNoteComponents { ownerRef = env.User05 },
        };
        var threadDocs = new ThreadComponents
        {
            threadNum = 1,
            noteCount = 2,
            username = env.Username01,
            notes = notes,
        };
        env.AddNoteThreadData([threadDocs]);
        string originalContent = $"<p>[User 05 - xForge]</p><p>original content</p>";
        string editedContent = $"<p>[User 05 - xForge]</p><p>content that will be discarded</p>";
        var comments = new[]
        {
            new ThreadNoteComponents
            {
                ownerRef = env.User05,
                tagsAdded = ["2"],
                content = originalContent,
            },
            new ThreadNoteComponents { ownerRef = env.User05, content = editedContent },
        };
        var commentThreads = new ThreadComponents
        {
            threadNum = 1,
            noteCount = 2,
            username = env.Username01,
            notes = comments,
        };
        env.AddParatextComments([commentThreads]);

        await using IConnection conn = await env.RealtimeService.ConnectAsync();
        IEnumerable<IDocument<NoteThread>> noteThreadDocs = await TestEnvironment.GetNoteThreadDocsAsync(
            conn,
            ["dataId1"]
        );
        Dictionary<string, ParatextUserProfile> ptProjectUsers = new[]
        {
            new ParatextUserProfile { OpaqueUserId = "syncuser01", Username = env.Username01 },
        }.ToDictionary(u => u.Username);
        Dictionary<int, ChapterDelta> chapterDeltas = env.GetChapterDeltasByBook(1, "Context before ", "Text selected");

        IEnumerable<NoteThreadChange> changes = env.Service.GetNoteThreadChanges(
            userSecret,
            paratextId,
            40,
            noteThreadDocs,
            chapterDeltas,
            ptProjectUsers
        );
        Assert.That(changes.Count, Is.EqualTo(0));
    }

    [Test]
    public async Task GetNoteThreadChanges_AddsNoteProperties()
    {
        var env = new TestEnvironment();
        string sfProjectId = env.Project01;
        var associatedPtUser = new SFParatextUser(env.Username01);
        var newPtUser = new SFParatextUser("New User");
        string ptProjectId = env.SetupProject(sfProjectId, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        env.AddTextDoc(40, 1);
        string threadId = "thread01";
        string newSyncUserRef = "newsyncuser";
        env.MockGuidService.NewObjectId().Returns(newSyncUserRef);

        // There is a PT Comment.
        var comment = new Paratext.Data.ProjectComments.Comment(newPtUser)
        {
            Thread = threadId,
            VerseRefStr = "MAT 1:1",
            SelectedText = "",
            ContextBefore = "",
            ContextAfter = "",
            StartPosition = 0,
            Contents = null,
            Date = $"2019-12-31T08:00:00.0000000+00:00",
            Deleted = false,
            Status = NoteStatus.Todo,
            Type = NoteType.Normal,
            ConflictType = NoteConflictType.None,
            AssignedUser = CommentThread.unassignedUser,
            AcceptedChangeXmlStr = "some xml",
        };
        env.AddParatextComment(comment);

        await using IConnection conn = await env.RealtimeService.ConnectAsync();
        // But we have no SF notes.
        IEnumerable<IDocument<NoteThread>> noteThreadDocs = await TestEnvironment.GetNoteThreadDocsAsync(conn, []);
        Dictionary<string, ParatextUserProfile> ptProjectUsers = new[]
        {
            new ParatextUserProfile { OpaqueUserId = "syncuser01", Username = env.Username01 },
        }.ToDictionary(u => u.Username);
        Dictionary<int, ChapterDelta> chapterDeltas = env.GetChapterDeltasByBook(1, "Context before ", "Text selected");

        // SUT
        IEnumerable<NoteThreadChange> changes = env.Service.GetNoteThreadChanges(
            userSecret,
            ptProjectId,
            40,
            noteThreadDocs,
            chapterDeltas,
            ptProjectUsers
        );
        // We fetched a single change, of one new note to create.

        Assert.That(changes.Count, Is.EqualTo(1));
        NoteThreadChange change = changes.First();
        Assert.That(change.ThreadId, Is.EqualTo(threadId));
        Assert.That(change.NotesAdded.Count, Is.EqualTo(1));
        Note newNote = change.NotesAdded[0];
        Assert.That(newNote.ThreadId, Is.EqualTo(threadId));
        Assert.That(newNote.SyncUserRef, Is.EqualTo(newSyncUserRef));
        Assert.That(newNote.Type, Is.EqualTo(NoteType.Normal.InternalValue));
        Assert.That(newNote.ConflictType, Is.EqualTo(NoteConflictType.None.InternalValue));
        Assert.That(newNote.AcceptedChangeXml, Is.EqualTo("some xml"));
        Assert.That(ptProjectUsers.Keys, Is.EquivalentTo(new[] { env.Username01, "New User" }));
        Assert.That(ptProjectUsers.TryGetValue("New User", out ParatextUserProfile profile), Is.True);
        Assert.That(profile.OpaqueUserId, Is.EqualTo(newSyncUserRef));
    }

    [Test]
    public async Task GetNoteThreadChanges_LineBreak_TextAnchorUpdated()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
        const string threadId = "thread1";
        const string text1 = "Text in first verse ";
        const string text2 = "text after ";
        const string selected = "stanza";
        const string text3 = " break";

        var comment = new Paratext.Data.ProjectComments.Comment(associatedPtUser)
        {
            Thread = threadId,
            VerseRefStr = "MAT 1:1",
            SelectedText = "stanza",
            ContextBefore = text1 + "\\b \\q" + text2 + selected,
            ContextAfter = text3,
            StartPosition = text1.Length + text2.Length,
            Contents = null,
            Date = "2019-12-31T08:00:00.0000000+00:00",
            Deleted = false,
            Status = NoteStatus.Todo,
            Type = NoteType.Normal,
            ConflictType = NoteConflictType.None,
            AssignedUser = CommentThread.unassignedUser,
        };
        env.AddParatextComment(comment);

        await using (await env.RealtimeService.ConnectAsync())
        {
            IEnumerable<IDocument<NoteThread>> noteThreadDocs = Array.Empty<IDocument<NoteThread>>();
            Dictionary<int, ChapterDelta> chapterDeltas = [];
            // These deltas represent the following USFM:
            // \c 1
            // \q
            // \v 1 Text in first verse
            // \b text after stanza break
            const string chapterText =
                "[ { \"insert\": { \"chapter\": { \"style\": \"c\", \"number\": \"1\" } } }, "
                + "{ \"insert\": { \"blank\": true }, \"attributes\": { \"segment\": \"q_1\" } },"
                + "{ \"insert\": { \"verse\": { \"style\": \"v\", \"number\": \"1\" } } }, "
                + "{ \"insert\": \""
                + text1
                + "\", \"attributes\": { \"segment\": \"verse_1_1\" } }, "
                + "{ \"insert\": \"\n\", \"attributes\": { \"para\": { \"style\": \"q\" } } }, "
                + "{ \"insert\": \""
                + text2
                + selected
                + text3
                + "\", \"attributes\": { \"segment\": \"verse_1_1/b_1\" } }, "
                + "{ \"insert\": \"\n\", \"attributes\": { \"para\": { \"style\": \"b\" } } } ]";
            var delta = new Delta(JToken.Parse(chapterText));
            ChapterDelta chapterDelta = new ChapterDelta(1, 1, true, delta);
            chapterDeltas.Add(1, chapterDelta);
            Dictionary<string, ParatextUserProfile> ptProjectUsers = new[]
            {
                new ParatextUserProfile { OpaqueUserId = "syncuser01", Username = env.Username01 },
            }.ToDictionary(u => u.Username);
            IEnumerable<NoteThreadChange> changes = env.Service.GetNoteThreadChanges(
                userSecret,
                ptProjectId,
                40,
                noteThreadDocs,
                chapterDeltas,
                ptProjectUsers
            );
            Assert.That(changes.Count, Is.EqualTo(1));
            NoteThreadChange change = changes.First();
            // include the newline length of the q paragraph break, but not the b
            int startPos = text1.Length + "\n".Length + text2.Length;
            TextAnchor expected = new TextAnchor { Start = startPos, Length = selected.Length };
            Assert.That(change.Position, Is.EqualTo(expected));
        }
    }

    [Test]
    public async Task GetNoteThreadChanges_NoChangeTriggersNoUpdate()
    {
        var env = new TestEnvironment();
        IEnumerable<NoteThreadChange> changes = await env.PrepareChangeOnSingleCommentAsync(
            (Paratext.Data.ProjectComments.Comment comment) => {
                // Not modifying comment.
            }
        );
        // There is one PT Comment and one SF Note. No changes were made. So no changes should be reported.
        Assert.That(changes.Count, Is.Zero);
    }

    [Test]
    public async Task GetNoteThreadChanges_UpdateTriggeredFromTypeChange()
    {
        var env = new TestEnvironment();
        IEnumerable<NoteThreadChange> changes = await env.PrepareChangeOnSingleCommentAsync(
            (Paratext.Data.ProjectComments.Comment comment) =>
            {
                // The incoming PT Comment Type is updated.
                Assert.That(comment.Type, Is.Not.EqualTo(NoteType.Conflict), "setup");
                comment.Type = NoteType.Conflict;
            },
            (NoteThread noteThread) =>
                // Setting a comment type to conflict also changes the tag icon (such as from "icon1" to "conflict1").
                // That would make the test pass, because the SF note would have a TagIcon change. But the test would
                // not be passing for the desired reason here, which is noticing a change specifically to the type. So
                // set the note icon ahead of time, on the SF Note in the SF DB, to "conflict1" so there is
                // no change triggered on a change to their icon. The trigger for change should  be from the update to
                // the PT Comment Type.
                noteThread.Notes[0].TagId = CommentTag.conflictTagId
        );

        Assert.That(changes.Count, Is.EqualTo(1));

        NoteThreadChange change = changes.First();
        Assert.That(change.ThreadId, Is.EqualTo("thread01"));
        Assert.That(change.NotesAdded.Count, Is.Zero);
        Assert.That(change.NotesDeleted.Count, Is.Zero);
        Assert.That(change.NotesUpdated.Count, Is.EqualTo(1));
        Note note = change.NotesUpdated[0];
        Assert.That(note.ThreadId, Is.EqualTo("thread01"));
        Assert.That(note.Type, Is.EqualTo(NoteType.Conflict.InternalValue));
    }

    [Test]
    public async Task GetNoteThreadChanges_DuplicateComments()
    {
        var env = new TestEnvironment();
        var associatedPTUser = new SFParatextUser(env.Username01);
        string projectId = env.SetupProject(env.Project01, associatedPTUser);
        var userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        ThreadNoteComponents[] noteComponents =
        [
            new ThreadNoteComponents
            {
                status = NoteStatus.Todo,
                tagsAdded = ["1"],
                assignedPTUser = CommentThread.unassignedUser,
                // tests that if duplicate project notes exist, the sync succeeds
                duplicate = true,
            },
        ];
        env.AddNoteThreadData(
            [
                new ThreadComponents
                {
                    threadNum = 1,
                    noteCount = 1,
                    notes = noteComponents,
                },
            ]
        );

        env.AddParatextComments(
            [
                new ThreadComponents
                {
                    threadNum = 1,
                    noteCount = 1,
                    notes = noteComponents,
                    username = env.Username01,
                },
            ]
        );

        var commentThread = env.ProjectCommentManager.FindThread("thread1");
        string commentId = commentThread.Comments[0].Id;
        Assert.That(commentThread.Comments.Where(c => c.Id == commentId).Count, Is.EqualTo(2));

        await using IConnection conn = await env.RealtimeService.ConnectAsync();
        IEnumerable<IDocument<NoteThread>> noteThreadDocs = await TestEnvironment.GetNoteThreadDocsAsync(
            conn,
            ["dataId1"]
        );
        Dictionary<int, ChapterDelta> chapterDeltas = env.GetChapterDeltasByBook(1, env.ContextBefore, "Text selected");
        Dictionary<string, ParatextUserProfile> ptProjectUsers = new[]
        {
            new ParatextUserProfile { OpaqueUserId = "syncuser01", Username = env.Username01 },
        }.ToDictionary(u => u.Username);
        IEnumerable<NoteThreadChange> changes = env.Service.GetNoteThreadChanges(
            userSecret,
            projectId,
            40,
            noteThreadDocs,
            chapterDeltas,
            ptProjectUsers
        );

        Assert.That(changes.Count(), Is.Zero);
    }

    [Test]
    public async Task GetNoteThreadChanges_DuplicateCommentsToExistingThread()
    {
        var env = new TestEnvironment();
        var associatedPTUser = new SFParatextUser(env.Username01);
        string projectId = env.SetupProject(env.Project01, associatedPTUser);
        var userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        ThreadNoteComponents[] sfNoteComponents =
        [
            new ThreadNoteComponents
            {
                status = NoteStatus.Todo,
                tagsAdded = ["1"],
                assignedPTUser = CommentThread.unassignedUser,
            },
        ];

        ThreadNoteComponents[] ptNoteComponents =
        [
            .. sfNoteComponents,
            new ThreadNoteComponents
            {
                status = NoteStatus.Todo,
                tagsAdded = ["1"],
                assignedPTUser = CommentThread.unassignedUser,
                duplicate = true,
            },
        ];
        env.AddNoteThreadData(
            [
                new ThreadComponents
                {
                    threadNum = 1,
                    noteCount = 1,
                    notes = sfNoteComponents,
                },
            ]
        );
        env.AddParatextComments(
            [
                new ThreadComponents
                {
                    threadNum = 1,
                    noteCount = 2,
                    notes = ptNoteComponents,
                    username = env.Username01,
                },
            ]
        );

        var commentThread = env.ProjectCommentManager.FindThread("thread1");
        string commentId1 = commentThread.Comments[0].Id;
        Assert.That(commentThread.Comments.Where(c => c.Id == commentId1).Count, Is.EqualTo(1));
        string commentId2 = commentThread.Comments[1].Id;
        Assert.That(commentThread.Comments.Where(c => c.Id == commentId2).Count, Is.EqualTo(2));

        await using IConnection conn = await env.RealtimeService.ConnectAsync();
        IEnumerable<IDocument<NoteThread>> noteThreadDocs = await TestEnvironment.GetNoteThreadDocsAsync(
            conn,
            ["dataId1"]
        );
        Dictionary<int, ChapterDelta> chapterDeltas = env.GetChapterDeltasByBook(1, env.ContextBefore, "Text selected");
        Dictionary<string, ParatextUserProfile> ptProjectUsers = new[]
        {
            new ParatextUserProfile { OpaqueUserId = "syncuser01", Username = env.Username01 },
        }.ToDictionary(u => u.Username);
        List<NoteThreadChange> changes =
        [
            .. env.Service.GetNoteThreadChanges(
                userSecret,
                projectId,
                40,
                noteThreadDocs,
                chapterDeltas,
                ptProjectUsers
            ),
        ];

        Assert.That(changes.Count, Is.EqualTo(1));
        Assert.That(changes[0].NotesAdded.Count, Is.EqualTo(1));
    }

    [Test]
    public async Task GetNoteThreadChanges_UpdateTriggeredFromConflictTypeChange()
    {
        var env = new TestEnvironment();
        IEnumerable<NoteThreadChange> changes = await env.PrepareChangeOnSingleCommentAsync(
            (Paratext.Data.ProjectComments.Comment comment) =>
            {
                // Already, the PT Comment and SF Note (below) will have Type 'Conflict'.
                comment.Type = NoteType.Conflict;
                // But the incoming PT Comment ConflictType is updated.
                comment.ConflictType = NoteConflictType.VerseTextConflict;
            },
            (NoteThread noteThread) =>
            {
                noteThread.Notes[0].Type = NoteType.Conflict.InternalValue;
                // (And set icon to match the note being a conflict note.)
                noteThread.Notes[0].TagId = CommentTag.conflictTagId;
                // SF Note ConflictType is something other than what the PT Comment ConflictType is. This is what gets
                // changed from.
                noteThread.Notes[0].ConflictType = NoteConflictType.VerseBridgeDifferences.InternalValue;
            }
        );

        Assert.That(changes.Count, Is.EqualTo(1));

        NoteThreadChange change = changes.First();
        Assert.That(change.ThreadId, Is.EqualTo("thread01"));
        Assert.That(change.NotesAdded.Count, Is.Zero);
        Assert.That(change.NotesDeleted.Count, Is.Zero);
        Assert.That(change.NotesUpdated.Count, Is.EqualTo(1));
        Note note = change.NotesUpdated[0];
        Assert.That(note.ThreadId, Is.EqualTo("thread01"));
        Assert.That(note.ConflictType, Is.EqualTo(NoteConflictType.VerseTextConflict.InternalValue));
    }

    [Test]
    public async Task GetNoteThreadChanges_UpdateTriggeredFromAcceptedChangeXmlChange()
    {
        var env = new TestEnvironment();
        IEnumerable<NoteThreadChange> changes = await env.PrepareChangeOnSingleCommentAsync(
            (Paratext.Data.ProjectComments.Comment comment) =>
            {
                // Already, the PT Comment and SF Note (below) will have Type 'Conflict' and
                // ConflictType 'VerseTextConflict'.
                comment.Type = NoteType.Conflict;
                comment.ConflictType = NoteConflictType.VerseTextConflict;
                // But the incoming PT Comment AcceptedChangeXmlStr is updated.
                comment.AcceptedChangeXmlStr = "new data";
            },
            (NoteThread noteThread) =>
            {
                noteThread.Notes[0].Type = NoteType.Conflict.InternalValue;
                // (And set icon to match the note being a conflict note.)
                noteThread.Notes[0].TagId = CommentTag.conflictTagId;
                noteThread.Notes[0].ConflictType = NoteConflictType.VerseTextConflict.InternalValue;
                // The SF Note AcceptedChangeXml is different. This is what gets changed from.
                noteThread.Notes[0].AcceptedChangeXml = "old data";
            }
        );

        Assert.That(changes.Count, Is.EqualTo(1));

        NoteThreadChange change = changes.First();
        Assert.That(change.ThreadId, Is.EqualTo("thread01"));
        Assert.That(change.NotesAdded.Count, Is.Zero);
        Assert.That(change.NotesDeleted.Count, Is.Zero);
        Assert.That(change.NotesUpdated.Count, Is.EqualTo(1));
        Note note = change.NotesUpdated[0];
        Assert.That(note.ThreadId, Is.EqualTo("thread01"));
        Assert.That(note.AcceptedChangeXml, Is.EqualTo("new data"));
    }

    [Test]
    public async Task GetNoteThreadChanges_UseCorrectTagIcon()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        env.AddTextDocs(40, 1, 10, "Context before ", "Text selected");

        env.AddNoteThreadData([new ThreadComponents { threadNum = 1, noteCount = 9 }]);
        ThreadNoteComponents[] threadNotes =
        [
            new ThreadNoteComponents
            {
                ownerRef = env.User01,
                status = NoteStatus.Todo,
                tagsAdded = ["2"],
            },
            new ThreadNoteComponents { ownerRef = env.User01, status = NoteStatus.Unspecified },
            new ThreadNoteComponents { ownerRef = env.User01, status = NoteStatus.Unspecified },
            new ThreadNoteComponents { ownerRef = env.User01, status = NoteStatus.Resolved },
            new ThreadNoteComponents
            {
                ownerRef = env.User01,
                status = NoteStatus.Todo,
                tagsAdded = ["3"],
            },
            new ThreadNoteComponents { ownerRef = env.User01, status = NoteStatus.Unspecified },
            new ThreadNoteComponents { ownerRef = env.User01, status = NoteStatus.Done },
            new ThreadNoteComponents { ownerRef = env.User01, status = NoteStatus.Todo },
            new ThreadNoteComponents
            {
                ownerRef = env.User01,
                status = NoteStatus.Todo,
                tagsAdded = ["4"],
            },
        ];
        env.AddParatextComments(
            [
                new ThreadComponents
                {
                    threadNum = 1,
                    noteCount = threadNotes.Length,
                    notes = threadNotes,
                    username = env.Username01,
                },
            ]
        );

        await using IConnection conn = await env.RealtimeService.ConnectAsync();
        IEnumerable<IDocument<NoteThread>> noteThreadDocs = await TestEnvironment.GetNoteThreadDocsAsync(
            conn,
            ["dataId1"]
        );
        Dictionary<string, ParatextUserProfile> ptProjectUsers = new[]
        {
            new ParatextUserProfile { OpaqueUserId = "syncuser01", Username = env.Username01 },
        }.ToDictionary(u => u.Username);
        Dictionary<int, ChapterDelta> chapterDeltas = env.GetChapterDeltasByBook(1, "Context before ", "Text selected");
        IEnumerable<NoteThreadChange> changes = env.Service.GetNoteThreadChanges(
            userSecret,
            ptProjectId,
            40,
            noteThreadDocs,
            chapterDeltas,
            ptProjectUsers
        );

        List<int?> expectedIcons = [2, null, null, 2, 3, null, 3, 3, 4];
        NoteThreadChange changedThread = changes.Where(c => c.ThreadId == "thread1").Single();
        for (int i = 0; i < expectedIcons.Count; i++)
        {
            Note note = changedThread.NotesUpdated[i];
            Assert.That(note.DataId, Is.EqualTo($"n{i + 1}onthread1"));
            Assert.That(note.TagId, Is.EqualTo(expectedIcons[i]));
        }
    }

    [Test]
    public async Task GetNoteThreadChanges_SetsAssignedUser()
    {
        // assign user id to assigned user
        var env = new TestEnvironment();
        var associatedPTUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPTUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        Dictionary<string, ParatextUserProfile> ptProjectUsers = new Dictionary<string, ParatextUserProfile>
        {
            {
                env.Username01,
                new ParatextUserProfile { OpaqueUserId = "syncuser01", Username = env.Username01 }
            },
        };

        ThreadNoteComponents[] getThreadNoteComponents(int noteCount, string[] assignedUsers, bool iconChange = false)
        {
            var components = new List<ThreadNoteComponents>();
            string[] commentTagsAdded = [CommentTag.toDoTagId.ToString()];
            if (iconChange)
            {
                string newIconId = "2";
                commentTagsAdded = [newIconId];
            }
            for (int i = 0; i < noteCount; i++)
            {
                string assignedUser = null;
                if (assignedUsers?.Length > i)
                {
                    assignedUser = assignedUsers[i];
                    if (ptProjectUsers.TryGetValue(assignedUsers[i], out ParatextUserProfile ptUser))
                        assignedUser = ptUser.OpaqueUserId;
                }
                var noteComponents = new ThreadNoteComponents
                {
                    status = NoteStatus.Todo,
                    tagsAdded = i == 0 ? commentTagsAdded : null,
                    assignedPTUser = assignedUser,
                    ownerRef = env.User01,
                };
                components.Add(noteComponents);
            }
            return [.. components];
        }
        ThreadNoteComponents[] threadDocNotes7 = getThreadNoteComponents(1, [env.Username02]);
        ThreadNoteComponents[] threadDocNotes8 = getThreadNoteComponents(1, [env.Username02]);
        env.AddNoteThreadData(
            [
                new ThreadComponents { threadNum = 1, noteCount = 1 },
                new ThreadComponents { threadNum = 3, noteCount = 1 },
                new ThreadComponents { threadNum = 4, noteCount = 1 },
                new ThreadComponents { threadNum = 5, noteCount = 1 },
                new ThreadComponents { threadNum = 6, noteCount = 1 },
                new ThreadComponents
                {
                    threadNum = 7,
                    noteCount = 1,
                    notes = threadDocNotes7,
                },
                new ThreadComponents
                {
                    threadNum = 8,
                    noteCount = 1,
                    notes = threadDocNotes8,
                },
            ]
        );

        string unassignedUserString = CommentThread.unassignedUser;
        string teamUserString = CommentThread.teamUser;
        ThreadNoteComponents[] threadNotes1 = getThreadNoteComponents(2, [teamUserString, env.Username02]);
        ThreadNoteComponents[] threadNotes2 = getThreadNoteComponents(1, [env.Username02]);
        ThreadNoteComponents[] threadNotes3 = getThreadNoteComponents(1, [env.Username02]);
        ThreadNoteComponents[] threadNotes4 = getThreadNoteComponents(1, [teamUserString]);
        ThreadNoteComponents[] threadNotes5 = getThreadNoteComponents(1, [unassignedUserString], true);
        ThreadNoteComponents[] threadNotes7 = getThreadNoteComponents(1, null);
        ThreadNoteComponents[] threadNotes8 = getThreadNoteComponents(1, [unassignedUserString]);
        env.AddParatextComments(
            [
                new ThreadComponents
                {
                    threadNum = 1,
                    noteCount = 2,
                    username = env.Username01,
                    notes = threadNotes1,
                },
                new ThreadComponents
                {
                    threadNum = 2,
                    noteCount = 1,
                    username = env.Username01,
                    notes = threadNotes2,
                },
                new ThreadComponents
                {
                    threadNum = 3,
                    noteCount = 1,
                    username = env.Username01,
                    notes = threadNotes3,
                },
                new ThreadComponents
                {
                    threadNum = 4,
                    noteCount = 1,
                    username = env.Username01,
                    notes = threadNotes4,
                },
                new ThreadComponents
                {
                    threadNum = 5,
                    noteCount = 1,
                    username = env.Username01,
                    notes = threadNotes5,
                },
                new ThreadComponents
                {
                    threadNum = 6,
                    noteCount = 1,
                    username = env.Username01,
                },
                new ThreadComponents
                {
                    threadNum = 7,
                    noteCount = 1,
                    username = env.Username01,
                    notes = threadNotes7,
                },
                new ThreadComponents
                {
                    threadNum = 8,
                    noteCount = 1,
                    username = env.Username01,
                    notes = threadNotes8,
                },
                new ThreadComponents { threadNum = 9, noteCount = 1 },
            ]
        );

        await using IConnection conn = await env.RealtimeService.ConnectAsync();
        // SUT
        IEnumerable<IDocument<NoteThread>> noteThreadDocs = await TestEnvironment.GetNoteThreadDocsAsync(
            conn,
            ["dataId1", "dataId3", "dataId4", "dataId5", "dataId6", "dataId7", "dataId8"]
        );
        var deltas = env.GetChapterDeltasByBook(1, "Context before ", "Text selected", true);
        IEnumerable<NoteThreadChange> changes = env.Service.GetNoteThreadChanges(
            userSecret,
            ptProjectId,
            40,
            noteThreadDocs,
            deltas,
            ptProjectUsers
        );

        Assert.That(changes.Count, Is.EqualTo(8));
        Assert.That(changes.Any(c => c.ThreadId == "thread6"), Is.False);
        // Note added and user assigned
        NoteThreadChange change1 = changes.Single(c => c.ThreadId == "thread1");
        // User 2 is added to ptProjectUsers
        Assert.That(ptProjectUsers.TryGetValue(env.Username02, out ParatextUserProfile ptUser02), Is.True);
        Assert.That(change1.Assignment, Is.EqualTo(ptUser02.OpaqueUserId));
        Assert.That(change1.NotesAdded.Count, Is.EqualTo(1));

        // Note thread added and user assigned
        NoteThreadChange change2 = changes.Single(c => c.ThreadId == "thread2");
        Assert.That(change2.Assignment, Is.EqualTo(ptUser02.OpaqueUserId));
        Assert.That(change2.NotesAdded.Count, Is.EqualTo(1));

        // Note updated with new user assigned
        NoteThreadChange change3 = changes.Single(c => c.ThreadId == "thread3");
        Assert.That(change3.Assignment, Is.EqualTo(ptUser02.OpaqueUserId));
        Assert.That(change3.NotesUpdated.Count, Is.EqualTo(1));
        Assert.That(change3.NotesUpdated[0].Assignment, Is.EqualTo(ptUser02.OpaqueUserId));

        // Note updated with team assigned
        NoteThreadChange change4 = changes.Single(c => c.ThreadId == "thread4");
        Assert.That(change4.Assignment, Is.EqualTo(CommentThread.teamUser));
        Assert.That(change4.NotesUpdated.Count, Is.EqualTo(1));
        Assert.That(change4.NotesUpdated[0].Assignment, Is.EqualTo(CommentThread.teamUser));

        // Note tagsAdded updated but assigned user unchanged
        NoteThreadChange change5 = changes.Single(c => c.ThreadId == "thread5");
        Assert.That(change5.Assignment, Is.EqualTo(""));
        Assert.That(change5.NotesUpdated.Count, Is.EqualTo(1));
        Assert.That(change5.NotesUpdated[0].Assignment, Is.EqualTo(unassignedUserString));

        // Note assigned to user 02 updated to null
        NoteThreadChange change7 = changes.Single(c => c.ThreadId == "thread7");
        Assert.That(change7.Assignment, Is.EqualTo(unassignedUserString));
        Assert.That(change7.NotesUpdated.Count, Is.EqualTo(1));
        Assert.That(change7.NotesUpdated[0].Assignment, Is.Null);

        // Note assigned to user 02 is unassigned
        NoteThreadChange change8 = changes.Single(c => c.ThreadId == "thread8");
        Assert.That(change8.Assignment, Is.EqualTo(unassignedUserString));
        Assert.That(change8.NotesUpdated.Count, Is.EqualTo(1));
        Assert.That(change8.NotesUpdated[0].Assignment, Is.EqualTo(unassignedUserString));

        // Note created with no Paratext user
        NoteThreadChange change9 = changes.Single(c => c.ThreadId == "thread9");
        Assert.That(change9.NotesAdded.Count, Is.EqualTo(1));
        Assert.That(change9.NotesAdded[0].SyncUserRef, Is.Null);
        Assert.That(change9.Assignment, Is.EqualTo(unassignedUserString));

        // User 02 is added to the list of Paratext Users on thread1 as an assigned user
        // No users should be added from the new thread9 change which has no paratext user
        // or through null assignment on thread7
        Assert.That(ptProjectUsers.Keys, Is.EquivalentTo(new[] { env.Username01, env.Username02 }));
    }

    [Test]
    public async Task GetNoteThreadChanges_MatchNotePositionToVerseText()
    {
        var env = new TestEnvironment();
        var associatedPTUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPTUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        env.AddParatextComments(
            [
                new ThreadComponents
                {
                    threadNum = 1,
                    noteCount = 1,
                    username = env.Username01,
                    alternateText = SelectionType.RelatedVerse,
                },
                new ThreadComponents
                {
                    threadNum = 8,
                    noteCount = 1,
                    username = env.Username01,
                    alternateText = SelectionType.Section,
                },
                new ThreadComponents
                {
                    threadNum = 9,
                    noteCount = 1,
                    username = env.Username01,
                    alternateText = SelectionType.SectionEnd,
                },
                new ThreadComponents
                {
                    threadNum = 10,
                    noteCount = 1,
                    username = env.Username01,
                    alternateText = SelectionType.RelatedVerse,
                },
            ]
        );

        await using (await env.RealtimeService.ConnectAsync())
        {
            var deltas = env.GetChapterDeltasByBook(1, "Context before ", "Text selected", true, true);
            Dictionary<string, ParatextUserProfile> ptProjectUsers = new Dictionary<string, ParatextUserProfile>
            {
                {
                    env.Username01,
                    new ParatextUserProfile { OpaqueUserId = "syncuser01", Username = env.Username01 }
                },
            };
            IEnumerable<NoteThreadChange> changes = env.Service.GetNoteThreadChanges(
                userSecret,
                ptProjectId,
                40,
                Array.Empty<IDocument<NoteThread>>(),
                deltas,
                ptProjectUsers
            );

            Assert.That(changes.Count, Is.EqualTo(4));
            NoteThreadChange thread1Change = changes.Single(c => c.ThreadId == "thread1");
            // The full matching text of thread1Change.SelectedText is not found. The best match is a substring.
            // This test also verifies that fetching verse text for verse 1 will fetch text from segment
            // "verse_1_1" but not segment "verse_1_10/p_1" (even tho the second segment name starts with the first
            // segment name). Incorrectly also fetching from "verse_1_10/p_1" would result in having a match for
            // thread1Change.SelectedText.
            Assert.That(thread1Change.SelectedText, Is.EqualTo("other text in verse"), "setup");
            Assert.That(thread1Change.Position.Length, Is.LessThan("other text in verse".Length));

            NoteThreadChange thread8Change = changes.Single(c => c.ThreadId == "thread8");
            string textBefore8 = "Context before Text selected thread8 context after.\n";
            int thread8AnchoringLength = "Section heading text".Length;
            TextAnchor expected8 = new TextAnchor { Start = textBefore8.Length, Length = thread8AnchoringLength };
            Assert.That(thread8Change.Position, Is.EqualTo(expected8));

            NoteThreadChange thread9Change = changes.Single(c => c.ThreadId == "thread9");
            string textBefore9 = "Context before Text selected thread9 context after.\nSection heading text";
            int thread9AnchorLength = 0;
            TextAnchor expected9 = new TextAnchor { Start = textBefore9.Length, Length = thread9AnchorLength };
            Assert.That(thread9Change.Position, Is.EqualTo(expected9));

            NoteThreadChange thread10Change = changes.Single(c => c.ThreadId == "thread10");
            string textBefore10 = "Context before Text selected thread10 context after.\n*";
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
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        env.AddTextDocs(40, 1, 6, "Context before ", "Text selected");
        // The text doc is set up so that verse 7 has unique text that we reattach to
        string verseStr = "MAT 1:7";
        ReattachedThreadInfo rti = env.GetReattachedThreadInfo(verseStr);

        env.AddNoteThreadData(
            [
                new ThreadComponents { threadNum = 1, noteCount = 1 },
                new ThreadComponents
                {
                    threadNum = 3,
                    noteCount = 1,
                    reattachedVerseStr = verseStr,
                },
                new ThreadComponents { threadNum = 4, noteCount = 1 },
                new ThreadComponents
                {
                    threadNum = 5,
                    noteCount = 1,
                    reattachedVerseStr = verseStr,
                },
            ]
        );
        env.AddParatextComments(
            [
                new ThreadComponents
                {
                    threadNum = 1,
                    noteCount = 1,
                    username = env.Username01,
                    reattachedVerseStr = verseStr,
                },
                new ThreadComponents
                {
                    threadNum = 2,
                    noteCount = 1,
                    username = env.Username01,
                    reattachedVerseStr = verseStr,
                },
                new ThreadComponents
                {
                    threadNum = 3,
                    noteCount = 1,
                    username = env.Username01,
                    reattachedVerseStr = verseStr,
                },
                new ThreadComponents
                {
                    threadNum = 4,
                    noteCount = 2,
                    username = env.Username01,
                    reattachedVerseStr = verseStr,
                },
                new ThreadComponents
                {
                    threadNum = 5,
                    noteCount = 1,
                    username = env.Username01,
                },
            ]
        );

        await using IConnection conn = await env.RealtimeService.ConnectAsync();
        IEnumerable<IDocument<NoteThread>> noteThreadDocs = await TestEnvironment.GetNoteThreadDocsAsync(
            conn,
            ["dataId1", "dataId3", "dataId4", "dataId5"]
        );
        Dictionary<int, ChapterDelta> chapterDeltas = env.GetChapterDeltasByBook(1, env.ContextBefore, "Text selected");
        Dictionary<string, ParatextUserProfile> syncUsers = new Dictionary<string, ParatextUserProfile>
        {
            {
                env.Username01,
                new ParatextUserProfile { OpaqueUserId = "syncuser01", Username = env.Username01 }
            },
        };
        IEnumerable<NoteThreadChange> changes = env.Service.GetNoteThreadChanges(
            userSecret,
            ptProjectId,
            40,
            noteThreadDocs,
            chapterDeltas,
            syncUsers
        );
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
            Length = rti.selectedText.Length,
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
            Length = change5.SelectedText.Length,
        };
        Assert.That(change5.Position, Is.EqualTo(originalAnchor));
    }

    [Test]
    public async Task GetNoteThreadChanges_ReattachedNote_HandleInvalidValues()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        env.AddTextDocs(40, 1, 6, "Context before ", "Text selected");
        // The text doc is set up so that verse 7 has unique text that we reattach to
        string verseStr = "MAT 1:7 This is not a valid verse   It was badly reattached";

        env.AddNoteThreadData(
            [
                new ThreadComponents { threadNum = 1, noteCount = 1 },
                new ThreadComponents
                {
                    threadNum = 3,
                    noteCount = 1,
                    reattachedVerseStr = verseStr,
                    doNotParseReattachedVerseStr = true,
                },
                new ThreadComponents { threadNum = 4, noteCount = 1 },
                new ThreadComponents
                {
                    threadNum = 5,
                    noteCount = 1,
                    reattachedVerseStr = verseStr,
                    doNotParseReattachedVerseStr = true,
                },
            ]
        );
        env.AddParatextComments(
            [
                new ThreadComponents
                {
                    threadNum = 1,
                    noteCount = 1,
                    username = env.Username01,
                    reattachedVerseStr = verseStr,
                    doNotParseReattachedVerseStr = true,
                },
                new ThreadComponents
                {
                    threadNum = 2,
                    noteCount = 1,
                    username = env.Username01,
                    reattachedVerseStr = verseStr,
                    doNotParseReattachedVerseStr = true,
                },
                new ThreadComponents
                {
                    threadNum = 3,
                    noteCount = 1,
                    username = env.Username01,
                    reattachedVerseStr = verseStr,
                    doNotParseReattachedVerseStr = true,
                },
                new ThreadComponents
                {
                    threadNum = 4,
                    noteCount = 2,
                    username = env.Username01,
                    reattachedVerseStr = verseStr,
                    doNotParseReattachedVerseStr = true,
                },
                new ThreadComponents
                {
                    threadNum = 5,
                    noteCount = 1,
                    username = env.Username01,
                },
            ]
        );

        await using IConnection conn = await env.RealtimeService.ConnectAsync();
        IEnumerable<IDocument<NoteThread>> noteThreadDocs = await TestEnvironment.GetNoteThreadDocsAsync(
            conn,
            ["dataId1", "dataId3", "dataId4", "dataId5"]
        );
        Dictionary<int, ChapterDelta> chapterDeltas = env.GetChapterDeltasByBook(1, env.ContextBefore, "Text selected");
        Dictionary<string, ParatextUserProfile> syncUsers = new Dictionary<string, ParatextUserProfile>
        {
            {
                env.Username01,
                new ParatextUserProfile { OpaqueUserId = "syncuser01", Username = env.Username01 }
            },
        };
        IEnumerable<NoteThreadChange> changes = env.Service.GetNoteThreadChanges(
            userSecret,
            ptProjectId,
            40,
            noteThreadDocs,
            chapterDeltas,
            syncUsers
        );
        Assert.That(changes.Count, Is.EqualTo(5));

        // Existing thread reattached
        NoteThreadChange change1 = changes.Single(c => c.ThreadId == "thread1");
        Assert.That(change1.NotesAdded.Count, Is.EqualTo(1));
        Assert.That(change1.NotesAdded.Single().Reattached, Is.Not.Null);

        // New thread note reattached
        NoteThreadChange change2 = changes.Single(c => c.ThreadId == "thread2");
        Assert.That(change2.NotesAdded.Count, Is.EqualTo(2));
        Assert.That(change2.NotesAdded[1].Reattached, Is.Not.Null);

        // The reattach note in thread3 is existing and is just a position change
        NoteThreadChange change3 = changes.Single(c => c.ThreadId == "thread2");
        Assert.That(change3.Position, Is.Not.Null);

        // Existing thread new comment and reattached
        NoteThreadChange change4 = changes.Single(c => c.ThreadId == "thread4");
        Assert.That(change4.NotesAdded.Count, Is.EqualTo(2));
        Assert.That(change4.NotesAdded[1].Reattached, Is.Not.Null);

        // Existing thread and reattach comment removed
        NoteThreadChange change5 = changes.Single(c => c.ThreadId == "thread5");
        Assert.That(change5.NoteIdsRemoved.Count, Is.EqualTo(1));
        Assert.That(change5.NoteIdsRemoved[0], Is.EqualTo("reattachedthread5"));
    }

    [Test]
    public void GetNoteThreadChanges_DeletedThreadIgnored()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string paratextId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        env.AddParatextComments(
            [
                new ThreadComponents
                {
                    threadNum = 1,
                    noteCount = 1,
                    username = env.Username01,
                    deletedNotes = [true],
                },
            ]
        );

        Dictionary<int, ChapterDelta> chapterDeltas = env.GetChapterDeltasByBook(1, env.ContextBefore, "Text selected");
        Dictionary<string, ParatextUserProfile> syncUsers = new Dictionary<string, ParatextUserProfile>
        {
            {
                env.Username01,
                new ParatextUserProfile { OpaqueUserId = "syncuser01", Username = env.Username01 }
            },
        };
        IEnumerable<IDocument<NoteThread>> emptyDocs = Array.Empty<IDocument<NoteThread>>();
        IEnumerable<NoteThreadChange> changes = env.Service.GetNoteThreadChanges(
            userSecret,
            paratextId,
            40,
            emptyDocs,
            chapterDeltas,
            syncUsers
        );
        Assert.That(changes.Count(), Is.EqualTo(0));
    }

    [Test]
    public async Task GetNoteThreadChanges_DeletedThreadRestored()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string paratextId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        string threadId = "thread1";
        string originalDataId = "dataId1";
        env.AddNoteThreadData(
            [
                new ThreadComponents
                {
                    threadNum = 1,
                    noteCount = 1,
                    deletedNotes = [true],
                },
            ]
        );

        env.AddParatextComments(
            [
                new ThreadComponents
                {
                    threadNum = 1,
                    noteCount = 1,
                    username = env.Username01,
                },
            ]
        );
        string newDataId = "newdataid1";
        env.MockGuidService.NewObjectId().Returns(newDataId);
        await using IConnection conn = await env.RealtimeService.ConnectAsync();
        IEnumerable<IDocument<NoteThread>> noteThreadDocs = await TestEnvironment.GetNoteThreadDocsAsync(
            conn,
            [originalDataId]
        );
        Dictionary<int, ChapterDelta> chapterDeltas = env.GetChapterDeltasByBook(1, env.ContextBefore, "Text selected");
        var ptProjectUsers = new Dictionary<string, ParatextUserProfile>
        {
            {
                env.Username01,
                new ParatextUserProfile
                {
                    Username = env.Username01,
                    OpaqueUserId = "syncuser01",
                    SFUserId = env.User01,
                }
            },
        };
        var changes = env.Service.GetNoteThreadChanges(
            userSecret,
            paratextId,
            40,
            noteThreadDocs,
            chapterDeltas,
            ptProjectUsers
        );

        NoteThreadChange change = changes.Single();
        Assert.That(change.ThreadId, Is.EqualTo(threadId));
        Assert.That(change.NotesAdded.Single().DataId, Is.EqualTo(newDataId));
    }

    [Test]
    public async Task GetNoteThreadChanges_NoChanges()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string paratextId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        string dataId = "dataId1";
        string content1a = "Reviewer comment";
        string content1b = "<p sf-user-label=\"true\">[User 05 - xForge]</p>\n<p>Reviewer comment</p>";
        string content2 = "Project admin comment";
        string content3 = "<p>Content with <bold>bold</bold> <italics>italics</italics> styling.</p>";
        string content4 = "Text with content styled <bold>bold</bold> <italics>italics</italics>.";

        // Test non-essential whitespace differences
        string baseContent = "<p>First paragraph content.</p><p>Second paragraph content.</p>";
        // new lines between paragraph
        string content5a = "<p>First paragraph content.</p>\n  <p>Second paragraph content.</p>";
        string content5b = baseContent;
        // new lines before and after all paragraphs
        string content6a = "\n  <p>First paragraph content.</p><p>Second paragraph content.</p>\n  ";
        string content6b = baseContent;
        // new lines between paragraph and bold tags
        string content7a = "<p>\n  <bold>First paragraph content.</bold>\n  </p><p>Second paragraph content.</p>";
        string content7b = "<p><bold>First paragraph content.</bold></p><p>Second paragraph content.</p>";

        // this is known to fail but is not critical to handle since formatted PT comments sync one way
        // string content8a = "<p>\n  First paragraph content.\n</p><p>Second paragraph content.</p>";
        // string content8b = "<p>\n      First paragraph content.\n</p><p>Second paragraph content.</p>";

        ThreadNoteComponents[] notesSF =
        [
            new ThreadNoteComponents { ownerRef = env.User05, content = content1a },
            new ThreadNoteComponents { ownerRef = env.User01, content = content2 },
            new ThreadNoteComponents { ownerRef = env.User01, content = content3 },
            new ThreadNoteComponents { ownerRef = env.User01, content = content4 },
            new ThreadNoteComponents { ownerRef = env.User01, content = content5a },
            new ThreadNoteComponents { ownerRef = env.User01, content = content6a },
            new ThreadNoteComponents { ownerRef = env.User01, content = content7a },
        ];
        ThreadComponents threadCompSF = new ThreadComponents
        {
            threadNum = 1,
            noteCount = notesSF.Length,
            username = env.Username01,
            notes = notesSF,
        };
        env.AddNoteThreadData([threadCompSF]);
        ThreadNoteComponents[] notesPT =
        [
            new ThreadNoteComponents { ownerRef = env.User05, content = content1b },
            new ThreadNoteComponents { ownerRef = env.User01, content = content2 },
            new ThreadNoteComponents { ownerRef = env.User01, content = content3 },
            new ThreadNoteComponents { ownerRef = env.User01, content = content4 },
            new ThreadNoteComponents { ownerRef = env.User01, content = content5b },
            new ThreadNoteComponents { ownerRef = env.User01, content = content6b },
            new ThreadNoteComponents { ownerRef = env.User01, content = content7b },
        ];
        ThreadComponents threadCompPT = new ThreadComponents
        {
            threadNum = 1,
            noteCount = notesPT.Length,
            username = env.Username01,
            notes = notesPT,
        };
        env.AddParatextComments([threadCompPT]);

        await using IConnection conn = await env.RealtimeService.ConnectAsync();
        IDocument<NoteThread> noteThreadDoc = await TestEnvironment.GetNoteThreadDocAsync(conn, dataId);
        Dictionary<string, ParatextUserProfile> ptProjectUsers = new Dictionary<string, ParatextUserProfile>
        {
            {
                env.Username01,
                new ParatextUserProfile
                {
                    OpaqueUserId = "syncuser01",
                    Username = env.Username01,
                    SFUserId = env.User01,
                }
            },
        };

        IEnumerable<NoteThreadChange> changes = env.Service.GetNoteThreadChanges(
            userSecret,
            paratextId,
            40,
            new[] { noteThreadDoc },
            env.GetChapterDeltasByBook(1, env.ContextBefore, "Text selected"),
            ptProjectUsers
        );
        Assert.That(changes.Count(), Is.EqualTo(0));
    }

    [Test]
    public async Task GetNoteThreadChanges_SupportsBiblicalTerms()
    {
        var env = new TestEnvironment();
        string sfProjectId = env.Project01;
        var associatedPtUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(sfProjectId, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        env.AddTextDoc(40, 1);
        const string threadId = "thread01";

        env.MockGuidService.NewObjectId().Returns("thread01note01");

        // There is a PT Comment.
        var comment = new Paratext.Data.ProjectComments.Comment(associatedPtUser)
        {
            Thread = threadId,
            VerseRefStr = "MAT 1:1",
            SelectedText = "",
            ContextBefore = "",
            ContextAfter = "",
            StartPosition = 0,
            Contents = null,
            Date = "2019-12-31T08:00:00.0000000+00:00",
            Deleted = false,
            Status = NoteStatus.Todo,
            Type = NoteType.Normal,
            ConflictType = NoteConflictType.None,
            AssignedUser = CommentThread.unassignedUser,
            AcceptedChangeXmlStr = "some xml",
            BiblicalTermId = "biblicalTerm01",
            ExtraHeadingInfo = new TermNoteHeadingInfo("lemma01", "language01", "transliteration01", "gloss01"),
        };
        env.AddParatextComment(comment);

        await using IConnection conn = await env.RealtimeService.ConnectAsync();
        // But we have no SF notes.
        IEnumerable<IDocument<NoteThread>> noteThreadDocs = await TestEnvironment.GetNoteThreadDocsAsync(conn, []);
        Dictionary<string, ParatextUserProfile> ptProjectUsers = new[]
        {
            new ParatextUserProfile { OpaqueUserId = "syncuser01", Username = env.Username01 },
        }.ToDictionary(u => u.Username);
        Dictionary<int, ChapterDelta> chapterDeltas = env.GetChapterDeltasByBook(1, "Context before ", "Text selected");

        // SUT
        IList<NoteThreadChange> changes =
        [
            .. env.Service.GetNoteThreadChanges(
                userSecret,
                ptProjectId,
                40,
                noteThreadDocs,
                chapterDeltas,
                ptProjectUsers
            ),
        ];
        // We fetched a single change, of one new note to create.

        Assert.That(changes.Count, Is.EqualTo(1));
        NoteThreadChange change = changes.First();
        Assert.That(change.ThreadId, Is.EqualTo(threadId));
        Assert.That(change.BiblicalTermId, Is.EqualTo("biblicalTerm01"));
        Assert.That(change.ExtraHeadingInfo?.Gloss, Is.EqualTo("gloss01"));
        Assert.That(change.ExtraHeadingInfo?.Language, Is.EqualTo("language01"));
        Assert.That(change.ExtraHeadingInfo?.Lemma, Is.EqualTo("lemma01"));
        Assert.That(change.ExtraHeadingInfo?.Transliteration, Is.EqualTo("transliteration01"));
        Assert.That(change.NotesAdded.Count, Is.EqualTo(1));
        Note newNote = change.NotesAdded[0];
        Assert.That(newNote.ThreadId, Is.EqualTo(threadId));
        Assert.That(newNote.Type, Is.EqualTo(NoteType.Normal.InternalValue));
        Assert.That(newNote.ConflictType, Is.EqualTo(NoteConflictType.None.InternalValue));
        Assert.That(newNote.AcceptedChangeXml, Is.EqualTo("some xml"));
    }

    [Test]
    public async Task UpdateParatextComments_AddsComment()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        const string dataId1 = "dataId1";
        const string dataId2 = "dataId2";
        const string dataId3 = "dataId3";
        const string thread1 = "thread1";
        const string thread2 = "thread2";
        const string thread3 = "thread3";
        ThreadNoteComponents[] thread1Notes =
        [
            new ThreadNoteComponents
            {
                ownerRef = env.User01,
                tagsAdded = ["1"],
                editable = true,
                versionNumber = 1,
                status = NoteStatus.Todo,
            },
        ];
        ThreadNoteComponents[] thread2Notes =
        [
            new ThreadNoteComponents
            {
                ownerRef = env.User05,
                tagsAdded = ["1"],
                editable = true,
                versionNumber = 1,
                content = "See 1&amp;2 John",
            },
        ];
        env.AddNoteThreadData(
            [
                new ThreadComponents
                {
                    threadNum = 1,
                    noteCount = 1,
                    isNew = true,
                    notes = thread1Notes,
                },
                new ThreadComponents
                {
                    threadNum = 2,
                    noteCount = 1,
                    isNew = true,
                    notes = thread2Notes,
                },
                new ThreadComponents
                {
                    threadNum = 3,
                    noteCount = 2,
                    deletedNotes = [false, true],
                    versionNumber = 1,
                },
            ]
        );
        env.AddParatextComments(
            [
                new ThreadComponents
                {
                    threadNum = 3,
                    noteCount = 1,
                    username = env.Username01,
                    deletedNotes = [false],
                    versionNumber = 1,
                },
            ]
        );
        await using IConnection conn = await env.RealtimeService.ConnectAsync();
        CommentThread thread = env.ProjectCommentManager.FindThread(thread1);
        Assert.That(thread, Is.Null);
        string[] noteThreadDataIds = [dataId1, dataId2, dataId3];
        List<IDocument<NoteThread>> noteThreadDocs =
        [
            .. (await TestEnvironment.GetNoteThreadDocsAsync(conn, noteThreadDataIds)),
        ];
        Dictionary<string, ParatextUserProfile> ptProjectUsers = new Dictionary<string, ParatextUserProfile>
        {
            {
                env.Username01,
                new ParatextUserProfile
                {
                    Username = env.Username01,
                    OpaqueUserId = "syncuser01",
                    SFUserId = env.User01,
                }
            },
        };
        SyncMetricInfo syncMetricInfo = await env.Service.UpdateParatextCommentsAsync(
            userSecret,
            ptProjectId,
            noteThreadDocs,
            env.usernames,
            ptProjectUsers,
            env.TagCount
        );
        thread = env.ProjectCommentManager.FindThread(thread1);
        Assert.That(thread.Comments.Count, Is.EqualTo(1));
        Paratext.Data.ProjectComments.Comment comment = thread.Comments.First();
        string expected =
            "thread1/User 01/2019-01-01T08:00:00.0000000+00:00-"
            + "MAT 1:1-"
            + "thread1 note 1.-"
            + "Start:0-"
            + "Tag:1-"
            + "Version:1-"
            + "Status:todo";
        Assert.That(comment.CommentToString(), Is.EqualTo(expected));

        thread = env.ProjectCommentManager.FindThread(thread2);
        Assert.That(thread.Comments.Count, Is.EqualTo(1));
        comment = thread.Comments.First();
        // expect the non-paratext ext user to be user05
        expected =
            "thread2/User 01/2019-01-01T08:00:00.0000000+00:00-"
            + "MAT 1:2-"
            + $"<p sf-user-label=\"true\">[User 05 - xForge]</p><p>{thread2Notes[0].content}</p>-"
            + "Start:0-"
            + "user05-"
            + "Tag:1-"
            + "Version:1-"
            + "Status:";
        Assert.That(comment.CommentToString(), Is.EqualTo(expected));
        // should not create second comment if the note is marked deleted
        CommentThread noteThread3 = env.ProjectCommentManager.FindThread(thread3);
        Assert.That(noteThread3.Comments.Single(c => c.Contents.InnerText.Contains($"{thread3} note 1.")), Is.Not.Null);
        Assert.That(ptProjectUsers.Keys, Is.EquivalentTo(new[] { env.Username01 }));
        IDocument<NoteThread> noteThread1Doc = noteThreadDocs.First(d => d.Data.DataId == dataId1);
        Assert.That(noteThread1Doc.Data.Notes[0].SyncUserRef, Is.EqualTo("syncuser01"));
        IDocument<NoteThread> noteThread2Doc = noteThreadDocs.First(d => d.Data.DataId == dataId2);
        Assert.That(noteThread2Doc.Data.Notes[0].SyncUserRef, Is.EqualTo("syncuser01"));
        Assert.That(syncMetricInfo, Is.EqualTo(new SyncMetricInfo(added: 2, deleted: 0, updated: 0)));

        // PT username is not written to server logs
        env.MockLogger.AssertNoEvent(logEvent => logEvent.Message!.Contains(env.Username02));
    }

    [Test]
    public async Task UpdateParatextComments_AddsCommentTagIdNotSet()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string paratextId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        string threadId = "thread1";
        string dataId = "dataId1";
        env.AddNoteThreadData(
            [
                new ThreadComponents
                {
                    threadNum = 1,
                    noteCount = 1,
                    isNew = true,
                    notes = [new ThreadNoteComponents { }],
                    editable = true,
                },
            ]
        );
        await using IConnection conn = await env.RealtimeService.ConnectAsync(env.User01);
        CommentThread commentThread = env.ProjectCommentManager.FindThread(threadId);
        Assert.That(commentThread, Is.Null);
        IDocument<NoteThread> noteThreadDoc = await TestEnvironment.GetNoteThreadDocAsync(conn, dataId);
        var paratextUsers = new Dictionary<string, ParatextUserProfile>();
        int newSfNoteTagId = env.TagCount + 1;
        var syncMetricsInfo = await env.Service.UpdateParatextCommentsAsync(
            userSecret,
            paratextId,
            new[] { noteThreadDoc },
            env.usernames,
            paratextUsers,
            newSfNoteTagId
        );
        commentThread = env.ProjectCommentManager.FindThread(threadId);
        Assert.That(commentThread.Comments.Count, Is.EqualTo(1));
        Assert.That(commentThread.Comments[0].TagsAdded, Is.EquivalentTo(new[] { $"{newSfNoteTagId}" }));
        Assert.That(syncMetricsInfo, Is.EqualTo(new SyncMetricInfo(added: 1, deleted: 0, updated: 0)));
    }

    [Test]
    public async Task UpdateParatextComments_EditsComment()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        string threadId = "thread1";
        string dataId = "dataId1";
        var threadNoteComponents = new[]
        {
            new ThreadNoteComponents
            {
                ownerRef = env.User01,
                tagsAdded = ["2"],
                versionNumber = 1,
            },
            new ThreadNoteComponents { ownerRef = env.User05, versionNumber = 1 },
        };
        env.AddNoteThreadData(
            [
                new ThreadComponents
                {
                    threadNum = 1,
                    noteCount = 2,
                    username = env.Username01,
                    notes = threadNoteComponents,
                    isEdited = true,
                    editable = true,
                },
            ]
        );
        env.AddParatextComments(
            [
                new ThreadComponents
                {
                    threadNum = 1,
                    noteCount = 2,
                    username = env.Username01,
                    notes = threadNoteComponents,
                },
            ]
        );

        await using IConnection conn = await env.RealtimeService.ConnectAsync();
        IDocument<NoteThread> noteThreadDoc = await TestEnvironment.GetNoteThreadDocAsync(conn, dataId);
        Dictionary<string, ParatextUserProfile> ptProjectUsers = new[]
        {
            new ParatextUserProfile
            {
                OpaqueUserId = "syncuser01",
                Username = env.Username01,
                SFUserId = env.User01,
            },
        }.ToDictionary(u => u.Username);
        SyncMetricInfo syncMetricInfo = await env.Service.UpdateParatextCommentsAsync(
            userSecret,
            ptProjectId,
            new[] { noteThreadDoc },
            env.usernames,
            ptProjectUsers,
            env.TagCount
        );

        CommentThread thread = env.ProjectCommentManager.FindThread(threadId);
        Assert.That(thread.Comments.Count, Is.EqualTo(2));
        Paratext.Data.ProjectComments.Comment comment = thread.Comments.First();
        string expected1 =
            "thread1/User 01/2019-01-01T08:00:00.0000000+00:00-"
            + "MAT 1:1-"
            + "thread1 note 1: EDITED.-"
            + "Start:15-"
            + "Tag:2-"
            + "Version:2-"
            + "Status:";
        Assert.That(comment.CommentToString(), Is.EqualTo(expected1));

        comment = thread.Comments[1];
        string expected2 =
            "thread1/User 01/2019-01-02T08:00:00.0000000+00:00-"
            + "MAT 1:1-"
            + "<p sf-user-label=\"true\">[User 05 - xForge]</p><p>thread1 note 2: EDITED.</p>-"
            + "Start:15-"
            + "user05-"
            + "Version:2-"
            + "Status:";
        Assert.That(comment.CommentToString(), Is.EqualTo(expected2));
        Assert.That(ptProjectUsers.Count, Is.EqualTo(1));
        Assert.That(syncMetricInfo, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 2)));

        // PT username is not written to server logs
        env.MockLogger.AssertNoEvent((LogEvent logEvent) => logEvent.Message.Contains(env.Username01));
    }

    [Test]
    public async Task UpdateParatextComments_UsesExistingUserToAddComments()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        // Update the username
        string newUsername = "New User 1";
        env.MockJwtTokenHelper.GetParatextUsername(Arg.Any<UserSecret>()).Returns(newUsername);
        env.Service.ForceParatextUsername(newUsername, env.Username01);

        ThreadNoteComponents note1 = new ThreadNoteComponents
        {
            content = "thread1 note 1",
            syncUserRef = "syncuser01",
            ownerRef = env.User01,
        };
        ThreadNoteComponents note2 = new ThreadNoteComponents
        {
            content = "thread1 note 2",
            syncUserRef = string.Empty,
            ownerRef = env.User01,
        };
        ThreadComponents sfThread1 = new ThreadComponents
        {
            threadNum = 1,
            noteCount = 2,
            username = env.Username01,
            editable = true,
            notes = [note1, note2],
        };
        ThreadComponents sfThread2 = new ThreadComponents
        {
            threadNum = 2,
            noteCount = 1,
            username = env.Username01,
            editable = true,
            isNew = true,
        };
        env.AddNoteThreadData([sfThread1, sfThread2]);
        ThreadComponents ptThread = new ThreadComponents
        {
            threadNum = 1,
            noteCount = 1,
            username = env.Username01,
            notes = [note1],
        };
        env.AddParatextComments([ptThread]);

        await using IConnection conn = await env.RealtimeService.ConnectAsync();
        IDocument<NoteThread> noteThreadDoc1 = await TestEnvironment.GetNoteThreadDocAsync(conn, "dataId1");
        IDocument<NoteThread> noteThreadDoc2 = await TestEnvironment.GetNoteThreadDocAsync(conn, "dataId2");
        Dictionary<string, ParatextUserProfile> ptProjectUsers = new Dictionary<string, ParatextUserProfile>
        {
            {
                env.Username01,
                new ParatextUserProfile
                {
                    OpaqueUserId = "syncuser01",
                    Username = env.Username01,
                    SFUserId = env.User01,
                }
            },
            {
                env.Username02,
                new ParatextUserProfile
                {
                    OpaqueUserId = "syncuser02",
                    Username = env.Username02,
                    SFUserId = env.User02,
                }
            },
            {
                newUsername,
                new ParatextUserProfile { OpaqueUserId = "syncuser03", Username = newUsername }
            },
        };
        SyncMetricInfo syncMetricInfo = await env.Service.UpdateParatextCommentsAsync(
            userSecret,
            ptProjectId,
            [noteThreadDoc1, noteThreadDoc2],
            env.usernames,
            ptProjectUsers,
            env.TagCount
        );

        Assert.That(syncMetricInfo, Is.EqualTo(new SyncMetricInfo(added: 2, deleted: 0, updated: 0)));
        CommentThread thread1 = env.ProjectCommentManager.FindThread("thread1");
        Assert.That(thread1.Comments.Count, Is.EqualTo(2));
        Assert.That(thread1.Comments[0].User, Is.EqualTo(env.Username01));
        Assert.That(thread1.Comments[1].User, Is.EqualTo(env.Username01));
        CommentThread thread2 = env.ProjectCommentManager.FindThread("thread2");
        Assert.That(thread2.Comments.Count, Is.EqualTo(1));
        Assert.That(thread2.Comments[0].User, Is.EqualTo(env.Username01));
    }

    [Test]
    public async Task UpdateParatextComments_DoesNotEditNonEditableComment()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        const string threadId = "thread1";
        const string dataId = "dataId1";
        var threadNoteComponents = new[]
        {
            new ThreadNoteComponents
            {
                ownerRef = env.User01,
                tagsAdded = ["2"],
                versionNumber = 1,
            },
            new ThreadNoteComponents { ownerRef = env.User05, versionNumber = 1 },
        };
        env.AddNoteThreadData(
            [
                new ThreadComponents
                {
                    threadNum = 1,
                    noteCount = 2,
                    username = env.Username01,
                    notes = threadNoteComponents,
                    isEdited = true,
                    editable = false,
                },
            ]
        );
        env.AddParatextComments(
            [
                new ThreadComponents
                {
                    threadNum = 1,
                    noteCount = 2,
                    username = env.Username01,
                    notes = threadNoteComponents,
                },
            ]
        );

        await using IConnection conn = await env.RealtimeService.ConnectAsync();
        IDocument<NoteThread> noteThreadDoc = await TestEnvironment.GetNoteThreadDocAsync(conn, dataId);
        Dictionary<string, ParatextUserProfile> ptProjectUsers = new[]
        {
            new ParatextUserProfile
            {
                OpaqueUserId = "syncuser01",
                Username = env.Username01,
                SFUserId = env.User01,
            },
        }.ToDictionary(u => u.Username);
        SyncMetricInfo syncMetricInfo = await env.Service.UpdateParatextCommentsAsync(
            userSecret,
            ptProjectId,
            new[] { noteThreadDoc },
            env.usernames,
            ptProjectUsers,
            env.TagCount
        );

        // Verify that the Scripture Forge comments were edited
        Assert.That(noteThreadDoc.Data.Notes.Count, Is.EqualTo(2));
        const string expectedSF1 = "thread1 note 1: EDITED.";
        Assert.That(noteThreadDoc.Data.Notes.First().Content, Is.EqualTo(expectedSF1));
        const string expectedSF2 = "thread1 note 2: EDITED.";
        Assert.That(noteThreadDoc.Data.Notes.Last().Content, Is.EqualTo(expectedSF2));

        // Verify the Paratext comments have not changed
        CommentThread thread = env.ProjectCommentManager.FindThread(threadId);
        Assert.That(thread.Comments.Count, Is.EqualTo(2));
        Paratext.Data.ProjectComments.Comment comment = thread.Comments.First();
        const string expected1 =
            "thread1/User 01/2019-01-01T08:00:00.0000000+00:00-"
            + "MAT 1:1-"
            + "thread1 note 1.-"
            + "Start:15-"
            + "Tag:2-"
            + "Version:1-"
            + "Status:";
        Assert.That(comment.CommentToString(), Is.EqualTo(expected1));

        comment = thread.Comments[1];
        const string expected2 =
            "thread1/User 01/2019-01-02T08:00:00.0000000+00:00-"
            + "MAT 1:1-"
            + "<p sf-user-label=\"true\">[User 05 - xForge]</p><p>thread1 note 2.</p>-"
            + "Start:15-"
            + "user05-"
            + "Version:1-"
            + "Status:";
        Assert.That(comment.CommentToString(), Is.EqualTo(expected2));
        Assert.That(ptProjectUsers.Count, Is.EqualTo(1));
        Assert.That(syncMetricInfo, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 0)));

        // PT username is not written to server logs
        env.MockLogger.AssertNoEvent((LogEvent logEvent) => logEvent.Message.Contains(env.Username01));
    }

    [Test]
    public async Task UpdateParatextComments_DoesNotEditCommentWithDifferentVersionNumber()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        const string threadId = "thread1";
        const string dataId = "dataId1";
        var threadNoteComponents = new[]
        {
            new ThreadNoteComponents { ownerRef = env.User01, tagsAdded = ["2"] },
        };
        env.AddNoteThreadData(
            [
                new ThreadComponents
                {
                    threadNum = 1,
                    noteCount = 1,
                    username = env.Username01,
                    notes = threadNoteComponents,
                    isEdited = true,
                    editable = true,
                    versionNumber = 1,
                },
            ]
        );
        env.AddParatextComments(
            [
                new ThreadComponents
                {
                    threadNum = 1,
                    noteCount = 1,
                    username = env.Username01,
                    notes = threadNoteComponents,
                    versionNumber = 2,
                },
            ]
        );

        await using IConnection conn = await env.RealtimeService.ConnectAsync();
        IDocument<NoteThread> noteThreadDoc = await TestEnvironment.GetNoteThreadDocAsync(conn, dataId);
        Dictionary<string, ParatextUserProfile> ptProjectUsers = new[]
        {
            new ParatextUserProfile
            {
                OpaqueUserId = "syncuser01",
                Username = env.Username01,
                SFUserId = env.User01,
            },
        }.ToDictionary(u => u.Username);
        SyncMetricInfo syncMetricInfo = await env.Service.UpdateParatextCommentsAsync(
            userSecret,
            ptProjectId,
            new[] { noteThreadDoc },
            env.usernames,
            ptProjectUsers,
            env.TagCount
        );

        CommentThread thread = env.ProjectCommentManager.FindThread(threadId);
        Assert.That(thread.Comments.Count, Is.EqualTo(1));
        Paratext.Data.ProjectComments.Comment comment = thread.Comments.First();
        const string expected1 =
            "thread1/User 01/2019-01-01T08:00:00.0000000+00:00-"
            + "MAT 1:1-"
            + "thread1 note 1.-"
            + "Start:15-"
            + "Tag:2-"
            + "Version:2-"
            + "Status:";
        Assert.That(comment.CommentToString(), Is.EqualTo(expected1));
        Assert.That(ptProjectUsers.Count, Is.EqualTo(1));
        Assert.That(syncMetricInfo, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 0)));

        // PT username is not written to server logs
        env.MockLogger.AssertNoEvent((LogEvent logEvent) => logEvent.Message.Contains(env.Username01));
    }

    [Test]
    public async Task UpdateParatextComments_RevertsPTChangesOnCommentsAuthoredByCommenters()
    {
        var env = new TestEnvironment();
        var associatedPTUser = new SFParatextUser(env.Username01);
        string paratextId = env.SetupProject(env.Project01, associatedPTUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        ThreadComponents threadComp = new ThreadComponents
        {
            threadNum = 1,
            noteCount = 1,
            versionNumber = 1,
            editable = true,
        };
        env.AddNoteThreadData([threadComp]);

        ThreadComponents threadCompPt = new ThreadComponents
        {
            threadNum = 1,
            noteCount = 1,
            username = env.Username01,
            versionNumber = 2,
            isEdited = true,
        };
        env.AddParatextComments([threadCompPt]);

        await using IConnection conn = await env.RealtimeService.ConnectAsync();
        string dataId = "dataId1";
        IDocument<NoteThread> noteThreadDoc = await TestEnvironment.GetNoteThreadDocAsync(conn, dataId);
        Dictionary<string, ParatextUserProfile> ptProjectUsers = new Dictionary<string, ParatextUserProfile>
        {
            {
                env.Username01,
                new ParatextUserProfile
                {
                    OpaqueUserId = "syncuser01",
                    Username = env.Username01,
                    SFUserId = env.User01,
                }
            },
        };

        SyncMetricInfo syncMetricInfo = await env.Service.UpdateParatextCommentsAsync(
            userSecret,
            paratextId,
            new[] { noteThreadDoc },
            env.usernames,
            ptProjectUsers,
            env.TagCount
        );

        CommentThread thread = env.ProjectCommentManager.FindThread("thread1");
        string expected =
            "thread1/User 01/2019-01-01T08:00:00.0000000+00:00-"
            + "MAT 1:1-"
            + "<p sf-user-label=\"true\">[User 05 - xForge]</p><p>thread1 note 1.</p>-"
            + "Start:15-"
            + "user05-"
            + "Tag:1-"
            + "Version:3-"
            + "Status:todo";
        Assert.That(thread.Comments.First().CommentToString(), Is.EqualTo(expected));
        Assert.That(syncMetricInfo, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 1)));

        // PT username is not written to server logs
        env.MockLogger.AssertNoEvent((LogEvent logEvent) => logEvent.Message.Contains(env.Username01));
    }

    [Test]
    public async Task UpdateParatextComments_NoChanges()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string paratextId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        string threadId = "thread1";
        string dataId = "dataId1";
        string content1a = "Reviewer comment";
        string content1b = "<p sf-user-label=\"true\">[User 05 - xForge]</p>\n<p>Reviewer comment</p>";
        string content2 = "Project admin comment";
        string content3 = "<p>Content with <bold>bold</bold> <italics>italics</italics> styling.</p>";
        string content4 = "Text with content styled <bold>bold</bold> <italics>italics</italics>.";

        // Test non-essential whitespace differences
        string baseContent = "<p>First paragraph content.</p><p>Second paragraph content.</p>";
        // new lines between paragraph
        string content5a = "<p>First paragraph content.</p>\n  <p>Second paragraph content.</p>";
        string content5b = baseContent;
        // new lines before and after all paragraphs
        string content6a = "\n  <p>First paragraph content.</p><p>Second paragraph content.</p>\n  ";
        string content6b = baseContent;
        // new lines between paragraph and bold tags
        string content7a = "<p>\n  <bold>First paragraph content.</bold>\n  </p><p>Second paragraph content.</p>";
        string content7b = "<p><bold>First paragraph content.</bold></p><p>Second paragraph content.</p>";

        ThreadNoteComponents[] notesSF =
        [
            new ThreadNoteComponents { ownerRef = env.User05, content = content1a },
            new ThreadNoteComponents { ownerRef = env.User01, content = content2 },
            new ThreadNoteComponents { ownerRef = env.User01, content = content3 },
            new ThreadNoteComponents { ownerRef = env.User01, content = content4 },
            new ThreadNoteComponents { ownerRef = env.User01, content = content5a },
            new ThreadNoteComponents { ownerRef = env.User01, content = content6a },
            new ThreadNoteComponents { ownerRef = env.User01, content = content7a },
        ];
        ThreadComponents threadCompSF = new ThreadComponents
        {
            threadNum = 1,
            noteCount = 7,
            username = env.Username01,
            notes = notesSF,
            versionNumber = 1,
        };
        env.AddNoteThreadData([threadCompSF]);
        ThreadNoteComponents[] notesPT =
        [
            new ThreadNoteComponents { ownerRef = env.User05, content = content1b },
            new ThreadNoteComponents { ownerRef = env.User01, content = content2 },
            new ThreadNoteComponents { ownerRef = env.User01, content = content3 },
            new ThreadNoteComponents { ownerRef = env.User01, content = content4 },
            new ThreadNoteComponents { ownerRef = env.User01, content = content5b },
            new ThreadNoteComponents { ownerRef = env.User01, content = content6b },
            new ThreadNoteComponents { ownerRef = env.User01, content = content7b },
        ];
        ThreadComponents threadCompPT = new ThreadComponents
        {
            threadNum = 1,
            noteCount = 7,
            username = env.Username01,
            notes = notesPT,
            versionNumber = 1,
        };
        env.AddParatextComments([threadCompPT]);

        await using IConnection conn = await env.RealtimeService.ConnectAsync();
        IDocument<NoteThread> noteThreadDoc = await TestEnvironment.GetNoteThreadDocAsync(conn, dataId);
        Dictionary<string, ParatextUserProfile> ptProjectUsers = new[]
        {
            new ParatextUserProfile
            {
                OpaqueUserId = "syncuser01",
                Username = env.Username01,
                SFUserId = env.User01,
            },
        }.ToDictionary(u => u.Username);
        SyncMetricInfo syncMetricInfo = await env.Service.UpdateParatextCommentsAsync(
            userSecret,
            paratextId,
            new[] { noteThreadDoc },
            env.usernames,
            ptProjectUsers,
            env.TagCount
        );

        CommentThread thread = env.ProjectCommentManager.FindThread(threadId);
        Assert.That(thread.Comments.Count, Is.EqualTo(7));
        Paratext.Data.ProjectComments.Comment comment = thread.Comments.First();
        string expected1 =
            "thread1/User 01/2019-01-01T08:00:00.0000000+00:00-"
            + "MAT 1:1-"
            + content1b
            + "-Start:15-"
            + "user05-"
            + "Version:1-"
            + "Status:";
        string expected2 =
            "thread1/User 01/2019-01-02T08:00:00.0000000+00:00-"
            + "MAT 1:1-"
            + content2
            + "-Start:15-"
            + "Version:1-"
            + "Status:";
        Assert.That(comment.CommentToString(), Is.EqualTo(expected1));
        comment = thread.Comments[1];
        Assert.That(comment.CommentToString(), Is.EqualTo(expected2));
        comment = thread.Comments[2];
        string expected3 =
            "thread1/User 01/2019-01-03T08:00:00.0000000+00:00-"
            + "MAT 1:1-"
            + content3
            + "-Start:15-"
            + "Version:1-"
            + "Status:";
        Assert.That(comment.CommentToString(), Is.EqualTo(expected3));
        comment = thread.Comments[3];
        string expected4 =
            "thread1/User 01/2019-01-04T08:00:00.0000000+00:00-"
            + "MAT 1:1-"
            + content4
            + "-Start:15-"
            + "Version:1-"
            + "Status:";
        Assert.That(comment.CommentToString(), Is.EqualTo(expected4));
        comment = thread.Comments[4];
        string expected5 =
            "thread1/User 01/2019-01-05T08:00:00.0000000+00:00-"
            + "MAT 1:1-"
            + content5b
            + "-Start:15-"
            + "Version:1-"
            + "Status:";
        Assert.That(comment.CommentToString(), Is.EqualTo(expected5));
        Assert.That(ptProjectUsers.Count, Is.EqualTo(1));
        Assert.That(syncMetricInfo, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 0)));

        // PT username is not written to server logs
        env.MockLogger.AssertNoEvent((LogEvent logEvent) => logEvent.Message.Contains(env.Username01));
    }

    [Test]
    public async Task UpdateParatextComments_DeleteComment()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string paratextId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        string threadId = "thread1";
        string dataId = "dataId1";
        var components = new ThreadComponents
        {
            threadNum = 1,
            noteCount = 1,
            username = env.Username01,
            editable = true,
        };
        env.AddParatextComments([components]);
        components.deletedNotes = [true];
        env.AddNoteThreadData([components]);
        CommentThread thread = env.ProjectCommentManager.FindThread(threadId);
        Assert.That(thread, Is.Not.Null);

        await using IConnection conn = await env.RealtimeService.ConnectAsync();
        IDocument<NoteThread> noteThreadDoc = await TestEnvironment.GetNoteThreadDocAsync(conn, dataId);

        // One comment is marked deleted, the other is permanently deleted
        Dictionary<string, ParatextUserProfile> ptProjectUsers = new[]
        {
            new ParatextUserProfile { OpaqueUserId = "syncuser01", Username = env.Username01 },
        }.ToDictionary(u => u.Username);
        var syncMetricInfo = await env.Service.UpdateParatextCommentsAsync(
            userSecret,
            paratextId,
            new[] { noteThreadDoc },
            env.usernames,
            ptProjectUsers,
            env.TagCount
        );
        Assert.That(syncMetricInfo, Is.EqualTo(new SyncMetricInfo(added: 0, updated: 0, deleted: 1)));
        thread = env.ProjectCommentManager.FindThread(threadId);
        Assert.That(thread, Is.Null);
    }

    [Test]
    public async Task UpdateParatextComments_DoesNotDeleteComment()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        string threadId = "thread1";
        string dataId = "dataId1";
        env.AddNoteThreadData(
            [
                new ThreadComponents
                {
                    threadNum = 1,
                    noteCount = 1,
                    username = env.Username01,
                    deletedNotes = [true],
                    versionNumber = 1,
                },
            ]
        );
        env.AddParatextComments(
            [
                new ThreadComponents
                {
                    threadNum = 1,
                    noteCount = 2,
                    username = env.Username01,
                    deletedNotes = [true, false],
                    versionNumber = 1,
                },
            ]
        );

        await using IConnection conn = await env.RealtimeService.ConnectAsync();
        IDocument<NoteThread> noteThreadDoc = await TestEnvironment.GetNoteThreadDocAsync(conn, dataId);

        // One comment is marked deleted, the other is permanently deleted
        Dictionary<string, ParatextUserProfile> ptProjectUsers = new[]
        {
            new ParatextUserProfile { OpaqueUserId = "syncuser01", Username = env.Username01 },
        }.ToDictionary(u => u.Username);
        var syncMetricInfo = await env.Service.UpdateParatextCommentsAsync(
            userSecret,
            ptProjectId,
            new[] { noteThreadDoc },
            env.usernames,
            ptProjectUsers,
            env.TagCount
        );

        CommentThread thread = env.ProjectCommentManager.FindThread(threadId);
        Assert.That(thread.Comments.Count, Is.EqualTo(2));
        var comment = thread.Comments.First();
        string expected =
            "thread1/User 01/2019-01-01T08:00:00.0000000+00:00-"
            + "MAT 1:1-"
            + "<p sf-user-label=\"true\">[User 05 - xForge]</p><p>thread1 note 1.</p>-"
            + "Start:15-"
            + "user05-"
            + "deleted-"
            + "Tag:1-"
            + "Version:1-"
            + "Status:todo";
        // comment already marked deleted is unchanged
        Assert.That(comment.CommentToString(), Is.EqualTo(expected));
        var comment2 = thread.Comments[1];
        string expected2 =
            "thread1/User 01/2019-01-02T08:00:00.0000000+00:00-"
            + "MAT 1:1-"
            + "<p sf-user-label=\"true\">[User 05 - xForge]</p><p>thread1 note 2.</p>-"
            + "Start:15-"
            + "user05-"
            + "Tag:1-"
            + "Version:1-"
            + "Status:todo";
        // comment without a corresponding note is unchanged
        Assert.That(comment2.CommentToString(), Is.EqualTo(expected2));
        Assert.That(syncMetricInfo, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 0)));

        // PT username is not written to server logs
        env.MockLogger.AssertNoEvent((LogEvent logEvent) => logEvent.Message.Contains(env.Username01));
    }

    [Test]
    public async Task UpdateParatextComments_HandlesCommentsWithNoContent()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string paratextId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        string threadId = "thread1";
        string dataId = "dataId1";
        ThreadNoteComponents[] threadNotes =
        [
            new ThreadNoteComponents { ownerRef = env.User05 },
            new ThreadNoteComponents
            {
                ownerRef = env.User05,
                forceNullContent = true,
                status = NoteStatus.Resolved,
            },
        ];
        ThreadComponents components = new ThreadComponents
        {
            threadNum = 1,
            noteCount = 2,
            username = env.Username01,
            notes = threadNotes,
            editable = true,
        };
        env.AddNoteThreadData([components]);
        env.AddParatextComments([components]);
        CommentThread thread = env.ProjectCommentManager.FindThread(threadId);
        Assert.That(thread, Is.Not.Null);

        await using IConnection conn = await env.RealtimeService.ConnectAsync();
        IDocument<NoteThread> noteThreadDoc = await TestEnvironment.GetNoteThreadDocAsync(conn, dataId);

        Dictionary<string, ParatextUserProfile> ptProjectUsers = new[]
        {
            new ParatextUserProfile { OpaqueUserId = "syncuser01", Username = env.Username01 },
        }.ToDictionary(u => u.Username);
        var syncMetricInfo = await env.Service.UpdateParatextCommentsAsync(
            userSecret,
            paratextId,
            new[] { noteThreadDoc },
            env.usernames,
            ptProjectUsers,
            env.TagCount
        );
        Assert.That(syncMetricInfo, Is.EqualTo(new SyncMetricInfo(added: 0, deleted: 0, updated: 0)));
        thread = env.ProjectCommentManager.FindThread(threadId);
        Assert.That(thread, Is.Not.Null);
    }

    [Test]
    public async Task UpdateParatextComments_DoesNotDeleteNonEditableComment()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string paratextId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        const string threadId = "thread1";
        const string dataId = "dataId1";
        var components = new ThreadComponents
        {
            threadNum = 1,
            noteCount = 1,
            username = env.Username01,
            editable = false,
        };
        env.AddParatextComments([components]);
        components.deletedNotes = [true];
        env.AddNoteThreadData([components]);
        CommentThread thread = env.ProjectCommentManager.FindThread(threadId);
        Assert.NotNull(thread);

        await using IConnection conn = await env.RealtimeService.ConnectAsync();
        IDocument<NoteThread> noteThreadDoc = await TestEnvironment.GetNoteThreadDocAsync(conn, dataId);

        Dictionary<string, ParatextUserProfile> ptProjectUsers = new[]
        {
            new ParatextUserProfile { OpaqueUserId = "syncuser01", Username = env.Username01 },
        }.ToDictionary(u => u.Username);
        var syncMetricInfo = await env.Service.UpdateParatextCommentsAsync(
            userSecret,
            paratextId,
            new[] { noteThreadDoc },
            env.usernames,
            ptProjectUsers,
            env.TagCount
        );
        Assert.That(syncMetricInfo, Is.EqualTo(new SyncMetricInfo(added: 0, updated: 0, deleted: 0)));
        thread = env.ProjectCommentManager.FindThread(threadId);
        Assert.NotNull(thread);
    }

    [Test]
    public async Task UpdateParatextComments_DoesNotDeleteThread()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string paratextId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        string threadId = "thread1";
        env.AddParatextComments(
            [
                new ThreadComponents
                {
                    threadNum = 1,
                    noteCount = 1,
                    username = env.Username01,
                },
            ]
        );
        CommentThread thread = env.ProjectCommentManager.FindThread(threadId);
        Assert.That(thread, Is.Not.Null);

        var ptProjectUsers = new Dictionary<string, ParatextUserProfile>
        {
            {
                env.Username01,
                new ParatextUserProfile { OpaqueUserId = "syncuser01", Username = env.Username01 }
            },
        };

        IEnumerable<IDocument<NoteThread>> emptyDocs = Array.Empty<IDocument<NoteThread>>();
        await env.Service.UpdateParatextCommentsAsync(
            userSecret,
            paratextId,
            emptyDocs,
            env.usernames,
            ptProjectUsers,
            env.TagCount
        );
        thread = env.ProjectCommentManager.FindThread(threadId);
        Assert.That(thread, Is.Not.Null);
    }

    [Test]
    public async Task UpdateParatextComments_ThrowsIfNotMatchingComment()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string paratextId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        string dataId = "dataId1";
        var thread = new ThreadComponents
        {
            threadNum = 1,
            noteCount = 1,
            username = env.Username01,
            isNew = false,
            editable = true,
            versionNumber = 1,
        };
        env.AddNoteThreadData([thread]);

        await using IConnection conn = await env.RealtimeService.ConnectAsync();
        IDocument<NoteThread> noteThreadDoc = await TestEnvironment.GetNoteThreadDocAsync(conn, dataId);

        Dictionary<string, ParatextUserProfile> ptProjectUsers = new Dictionary<string, ParatextUserProfile>
        {
            {
                env.Username01,
                new ParatextUserProfile { OpaqueUserId = "syncuser01", Username = env.Username01 }
            },
        };
        // The comment thread must exist if the Note Thread is not new
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.UpdateParatextCommentsAsync(
                userSecret,
                paratextId,
                new[] { noteThreadDoc },
                env.usernames,
                ptProjectUsers,
                env.TagCount
            )
        );
    }

    [Test]
    public void GetParatextSettings_RetrievesTagIcons()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string paratextId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        var noteTag = new NoteTag
        {
            TagId = 5,
            Icon = "sf05",
            Name = "SF Note Tag",
            CreatorResolve = true,
        };
        env.SetupCommentTags(env.ProjectScrText, noteTag);
        ParatextSettings? settings = env.Service.GetParatextSettings(userSecret, paratextId);
        NoteTag? resultTag = settings?.NoteTags.Single(t => t.Name == noteTag.Name);
        Assert.That(resultTag, Is.Not.Null);
        Assert.That(resultTag.CreatorResolve, Is.True);
    }

    [Test]
    public void GetParatextSettings_NoteTagSetToNull()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string paratextId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        var noteTag = new NoteTag
        {
            TagId = CommentTag.notSetId,
            Icon = "sf05",
            Name = "SF Note Tag",
            CreatorResolve = false,
        };
        ParatextSettings? settings = env.Service.GetParatextSettings(userSecret, paratextId);
        Assert.That(settings?.NoteTags.FirstOrDefault(t => t.Icon == noteTag.Icon), Is.Null);
    }

    [Test]
    public void UpdateCommentTag_WritesTagIcon()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string paratextId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        string icon = "someIcon";
        var noteTag = new NoteTag
        {
            TagId = CommentTag.notSetId,
            Icon = icon,
            Name = "SF Note Tag",
        };
        env.Service.UpdateCommentTag(userSecret, paratextId, noteTag);
        // the new tag is created with a tag id one greater than the last used id
        int tagId = env.TagCount + 1;
        ParatextSettings? settings = env.Service.GetParatextSettings(userSecret, paratextId);
        Assert.That(settings?.NoteTags.First(t => t.Icon == icon).TagId, Is.EqualTo(tagId));
    }

    [Test]
    public void UpdateCommentTag_DoesNotWriteIfExistingTag()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string paratextId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        int existingId = 5;
        var noteTag = new NoteTag
        {
            TagId = existingId,
            Icon = "existingIcon",
            Name = "SF Note Tag",
        };
        env.SetupCommentTags(env.ProjectScrText, noteTag);
        Assert.Throws<ArgumentException>(() => env.Service.UpdateCommentTag(userSecret, paratextId, noteTag));
    }

    [Test]
    public void SendReceiveAsync_BadArguments()
    {
        var env = new TestEnvironment();
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        Assert.ThrowsAsync<ArgumentNullException>(() =>
            env.Service.SendReceiveAsync(null, null, null, default, Substitute.For<SyncMetrics>())
        );
        Assert.ThrowsAsync<ArgumentNullException>(() =>
            env.Service.SendReceiveAsync(
                null,
                env.PTProjectIds[env.Project01].Id,
                null,
                default,
                Substitute.For<SyncMetrics>()
            )
        );
        Assert.ThrowsAsync<ArgumentNullException>(() =>
            env.Service.SendReceiveAsync(user01Secret, null, null, default, Substitute.For<SyncMetrics>())
        );
    }

    [Test]
    public void SendReceiveAsync_ShareChangesErrors_Throws()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string projectId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
        env.SetupSuccessfulSendReceive();
        // Setup share changes to be unsuccessful
        env.MockSharingLogicWrapper.ShareChanges(
                Arg.Any<List<SharedProject>>(),
                Arg.Any<SharedRepositorySource>(),
                out Arg.Any<List<SendReceiveResult>>(),
                Arg.Any<List<SharedProject>>()
            )
            .Returns(false);

        InvalidOperationException ex = Assert.ThrowsAsync<InvalidOperationException>(() =>
            env.Service.SendReceiveAsync(user01Secret, projectId, null, default, Substitute.For<SyncMetrics>())
        );
        Assert.That(ex.Message, Does.Contain("Failed: Errors occurred"));

        // Check exception is thrown if errors occurred, even if share changes succeeded
        env.MockSharingLogicWrapper.HandleErrors(Arg.Any<Action>()).Returns(false);
        ex = Assert.ThrowsAsync<InvalidOperationException>(() =>
            env.Service.SendReceiveAsync(user01Secret, projectId, null, default, Substitute.For<SyncMetrics>())
        );
        Assert.That(ex.Message, Does.Contain("Failed: Errors occurred"));
    }

    [Test]
    public void SendReceiveAsync_NoMatchingSourceRepository_Throws()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        env.SetupProject(env.Project01, associatedPtUser);
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);

        ArgumentException ex = Assert.ThrowsAsync<ArgumentException>(() =>
            env.Service.SendReceiveAsync(user01Secret, "badProjectId", null, default, Substitute.For<SyncMetrics>())
        );
        Assert.That(ex.Message, Does.Contain("PT projects with the following PT ids were requested"));
    }

    [TestCase(SendReceiveResultEnum.Failed)]
    [TestCase(SendReceiveResultEnum.NotUpgraded)]
    [TestCase(SendReceiveResultEnum.ProjectVersionUpgraded)]
    public void SendReceiveAsync_ShareChangesErrors_InResultsOnly(SendReceiveResultEnum sendReceiveResult)
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string projectId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
        env.SetupSuccessfulSendReceive();
        // Setup share changes to be unsuccessful, but return true
        // This scenario occurs if a project is locked on the PT server
        env.MockSharingLogicWrapper.ShareChanges(
                Arg.Any<List<SharedProject>>(),
                Arg.Any<SharedRepositorySource>(),
                out Arg.Any<List<SendReceiveResult>>(),
                Arg.Any<List<SharedProject>>()
            )
            .Returns(x =>
            {
                x[2] = new List<SendReceiveResult>
                {
                    new SendReceiveResult(new SharedProject()) { Result = sendReceiveResult },
                };
                return true;
            });

        InvalidOperationException ex = Assert.ThrowsAsync<InvalidOperationException>(() =>
            env.Service.SendReceiveAsync(user01Secret, projectId, null, default, Substitute.For<SyncMetrics>())
        );
        Assert.That(ex.Message, Does.Contain("Failed: Errors occurred"));

        // Check exception is thrown if errors occurred, even if share changes succeeded
        env.MockSharingLogicWrapper.HandleErrors(Arg.Any<Action>()).Returns(false);
        ex = Assert.ThrowsAsync<InvalidOperationException>(() =>
            env.Service.SendReceiveAsync(user01Secret, projectId, null, default, Substitute.For<SyncMetrics>())
        );
        Assert.That(ex.Message, Does.Contain("Failed: Errors occurred"));
    }

    [Test]
    public async Task SendReceiveAsync_UserIsAdministrator_Succeeds()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        IInternetSharedRepositorySource mockSource = env.SetSharedRepositorySource(
            user01Secret,
            UserRoles.Administrator
        );
        env.SetupSuccessfulSendReceive();

        // SUT 1
        await env.Service.SendReceiveAsync(user01Secret, ptProjectId, null, default, Substitute.For<SyncMetrics>());
        env.MockSharingLogicWrapper.Received(1)
            .ShareChanges(
                Arg.Is<List<SharedProject>>(list => list.Count == 1 && list[0].SendReceiveId.Id == ptProjectId),
                Arg.Any<SharedRepositorySource>(),
                out Arg.Any<List<SendReceiveResult>>(),
                Arg.Is<List<SharedProject>>(list => list.Count == 1 && list[0].SendReceiveId.Id == ptProjectId)
            );
        mockSource.DidNotReceive().Pull(Arg.Any<string>(), Arg.Any<SharedRepository>());
        env.MockSharingLogicWrapper.ClearReceivedCalls();

        // Passing a PT project Id for a project the user does not have access to fails early without doing S/R
        // SUT 2
        ArgumentException resultingException = Assert.ThrowsAsync<ArgumentException>(() =>
            env.Service.SendReceiveAsync(
                user01Secret,
                "unknownPtProjectId8",
                null,
                default,
                Substitute.For<SyncMetrics>()
            )
        );
        Assert.That(resultingException.Message, Does.Contain("unknownPtProjectId8"));
        env.MockSharingLogicWrapper.DidNotReceive()
            .ShareChanges(default, Arg.Any<SharedRepositorySource>(), out Arg.Any<List<SendReceiveResult>>(), default);
    }

    [Test]
    public async Task SendReceiveAsync_ProjectIsRegistered_Succeeds()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        IInternetSharedRepositorySource mockSource = env.SetSharedRepositorySource(
            user01Secret,
            userRoleOnAllThePtProjects: UserRoles.Administrator,
            extraSharedRepository: false,
            paratextId: ptProjectId
        );
        env.SetupSuccessfulSendReceive();

        // SUT 1
        await env.Service.SendReceiveAsync(user01Secret, ptProjectId, null, default, Substitute.For<SyncMetrics>());
        env.MockSharingLogicWrapper.Received(1)
            .ShareChanges(
                Arg.Is<List<SharedProject>>(list => list.Count == 1 && list[0].SendReceiveId.Id == ptProjectId),
                Arg.Any<SharedRepositorySource>(),
                out Arg.Any<List<SendReceiveResult>>(),
                Arg.Is<List<SharedProject>>(list => list.Count == 1 && list[0].SendReceiveId.Id == ptProjectId)
            );
        mockSource.DidNotReceive().Pull(Arg.Any<string>(), Arg.Any<SharedRepository>());
        env.MockSharingLogicWrapper.ClearReceivedCalls();

        // Passing a PT project Id for a project the user does not have access to fails early without doing S/R
        // SUT 2
        ArgumentException resultingException = Assert.ThrowsAsync<ArgumentException>(() =>
            env.Service.SendReceiveAsync(
                user01Secret,
                "unknownPtProjectId8",
                null,
                default,
                Substitute.For<SyncMetrics>()
            )
        );
        Assert.That(resultingException.Message, Does.Contain("unknownPtProjectId8"));
        env.MockSharingLogicWrapper.DidNotReceive()
            .ShareChanges(default, Arg.Any<SharedRepositorySource>(), out Arg.Any<List<SendReceiveResult>>(), default);
    }

    [Test]
    public async Task SendReceiveAsync_ProjectNotYetCloned()
    {
        var env = new TestEnvironment();
        string ptProjectId = env.PTProjectIds[env.Project02].Id;
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        IInternetSharedRepositorySource mockSource = env.SetSharedRepositorySource(
            user01Secret,
            UserRoles.Administrator
        );
        env.SetupSuccessfulSendReceive();
        var associatedPtUser = new SFParatextUser(env.Username01);
        // FindById fails the first time, and then succeeds the second time after the pt project repo is cloned.
        MockScrText scrText = env.GetScrText(associatedPtUser, ptProjectId);
        env.MockScrTextCollection.FindById(env.Username01, ptProjectId).Returns(null, scrText);

        string clonePath = Path.Join(env.SyncDir, ptProjectId, "target");
        env.MockFileSystemService.DirectoryExists(clonePath).Returns(false);

        // SUT
        await env.Service.SendReceiveAsync(user01Secret, ptProjectId, null, default, Substitute.For<SyncMetrics>());
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
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        IInternetSharedRepositorySource mockSource = env.SetSharedRepositorySource(
            user01Secret,
            UserRoles.Administrator
        );
        env.SetupSuccessfulSendReceive();

        ScrText sourceScrText = env.GetScrText(associatedPtUser, sourceProjectId);
        env.MockScrTextCollection.FindById(env.Username01, sourceProjectId).Returns(sourceScrText);

        // The permissions will return a null user, so we will have the registry return the correct permissions
        var permissionManager = new ParatextRegistryPermissionManager(env.Username01);
        permissionManager.CreateFirstAdminUser();
        env.MockSharingLogicWrapper.SearchForBestProjectUsersData(
                Arg.Any<SharedRepositorySource>(),
                Arg.Any<SharedProject>()
            )
            .Returns(permissionManager);

        ParatextProject targetProject = await env.Service.SendReceiveAsync(
            user01Secret,
            targetProjectId,
            null,
            default,
            Substitute.For<SyncMetrics>()
        );
        Assert.IsNotNull(targetProject);
        ParatextProject sourceProject = await env.Service.SendReceiveAsync(
            user01Secret,
            sourceProjectId,
            null,
            default,
            Substitute.For<SyncMetrics>()
        );
        Assert.IsNotNull(sourceProject);
        // Below, we are checking also that the SharedProject has a
        // Permissions that is set from the SharedProject's ScrText.Permissions.
        env.MockSharingLogicWrapper.Received(2)
            .ShareChanges(
                Arg.Is<List<SharedProject>>(list =>
                    list.Count.Equals(1)
                    && (list[0].SendReceiveId.Id == targetProjectId || list[0].SendReceiveId.Id == sourceProjectId)
                    && list[0].Permissions.GetUser(null).UserName == env.Username01
                ),
                Arg.Any<SharedRepositorySource>(),
                out Arg.Any<List<SendReceiveResult>>(),
                Arg.Any<List<SharedProject>>()
            );
        env.MockFileSystemService.DidNotReceive().DeleteDirectory(Arg.Any<string>());

        // Replaces obsolete source project if the source project has been changed
        string newSourceProjectId = env.PTProjectIds[env.Project03].Id;
        string sourcePath = Path.Join(env.SyncDir, newSourceProjectId, "target");

        // Only set the new source ScrText when it is "cloned" to the filesystem
        env.MockFileSystemService.When(fs => fs.CreateDirectory(sourcePath))
            .Do(_ =>
            {
                ScrText newSourceScrText = env.GetScrText(associatedPtUser, newSourceProjectId);
                env.MockScrTextCollection.FindById(env.Username01, newSourceProjectId).Returns(newSourceScrText);
            });

        targetProject = await env.Service.SendReceiveAsync(
            user01Secret,
            targetProjectId,
            null,
            default,
            Substitute.For<SyncMetrics>()
        );
        Assert.IsNotNull(targetProject);
        sourceProject = await env.Service.SendReceiveAsync(
            user01Secret,
            newSourceProjectId,
            null,
            default,
            Substitute.For<SyncMetrics>()
        );
        Assert.IsNotNull(sourceProject);
        env.MockFileSystemService.DidNotReceive().DeleteDirectory(Arg.Any<string>());
        env.MockFileSystemService.Received(1).CreateDirectory(sourcePath);
        mockSource
            .Received(1)
            .Pull(sourcePath, Arg.Is<SharedRepository>(repo => repo.SendReceiveId.Id == newSourceProjectId));
        env.MockHgWrapper.Received(1).Update(sourcePath);
    }

    [Test]
    public async Task SendReceiveAsync_SourceResource_Missing()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
        env.SetupSuccessfulSendReceive();
        env.SetRestClientFactory(user01Secret);
        ScrTextCollection.Initialize("/srv/scriptureforge/projects");
        string resourceId = "test_resource_id"; // A missing or invalid resource or project
        await env.Service.SendReceiveAsync(user01Secret, ptProjectId, null, default, Substitute.For<SyncMetrics>());
        Assert.ThrowsAsync<ArgumentException>(() =>
            env.Service.SendReceiveAsync(user01Secret, resourceId, null, default, Substitute.For<SyncMetrics>())
        );
    }

    [Test]
    public async Task SendReceiveAsync_SourceResource_DoesNotRemigrateLdml()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
        env.SetupSuccessfulSendReceive();
        env.SetRestClientFactory(user01Secret);

        // Set up the Resource ScrText
        string resourceId = env.Resource3Id; // See the XML in SetRestClientFactory for this
        using MockScrText scrText = env.GetScrText(associatedPtUser, resourceId);
        env.MockScrTextCollection.FindById(Arg.Any<string>(), resourceId).Returns(scrText);
        ScrTextCollection.Initialize("/srv/scriptureforge/projects");

        // Set up the mock file system calls used by the migration
        env.MockFileSystemService.FileExists(Arg.Is<string>(p => p.EndsWith("ldml.xml"))).Returns(true);
        env.MockFileSystemService.FileExists(Arg.Is<string>(p => p.EndsWith(".ldml"))).Returns(true);

        // SUT
        ParatextProject sourceProject = await env.Service.SendReceiveAsync(
            user01Secret,
            resourceId,
            null,
            default,
            Substitute.For<SyncMetrics>()
        );
        Assert.IsNotNull(sourceProject);
        Assert.IsInstanceOf(typeof(ParatextResource), sourceProject);
        env.MockFileSystemService.DidNotReceive()
            .MoveFile(Arg.Is<string>(p => p.EndsWith("ldml.xml")), Arg.Is<string>(p => p.EndsWith(".ldml")));
    }

    [Test]
    public async Task SendReceiveAsync_SourceResource_MigratesLdml()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
        env.SetupSuccessfulSendReceive();
        env.SetRestClientFactory(user01Secret);

        // Set up the Resource ScrText before it is installed on disk
        string resourceId = env.Resource3Id; // See the XML in SetRestClientFactory for this
        using MockResourceScrText resourceScrText = env.GetResourceScrText(associatedPtUser, resourceId, "RV1895");
        env.MockScrTextCollection.CreateResourceScrText(
                Arg.Any<string>(),
                Arg.Any<ProjectName>(),
                Arg.Any<IZippedResourcePasswordProvider>()
            )
            .Returns(resourceScrText);
        env.MockFileSystemService.FileExists(Arg.Is<string>(p => p.EndsWith(".p8z"))).Returns(true);
        await using var zipStream = await TestEnvironment.CreateZipStubAsync();
        env.MockFileSystemService.OpenFile(
                Arg.Is<string>(p => p.EndsWith(".p8z")),
                FileMode.Open,
                FileAccess.Read,
                FileShare.Read
            )
            .Returns(zipStream);
        await using var stream = new MemoryStream();
        env.MockFileSystemService.CreateFile(Arg.Any<string>()).Returns(stream);

        // Set up the Resource ScrText when it is installed on disk
        using MockScrText scrText = env.GetScrText(associatedPtUser, resourceId);
        env.MockScrTextCollection.FindById(Arg.Any<string>(), resourceId).Returns(scrText);
        ScrTextCollection.Initialize("/srv/scriptureforge/projects");

        // Set up the mock file system calls used by the migration
        env.MockFileSystemService.FileExists(Arg.Is<string>(p => p.EndsWith("ldml.xml"))).Returns(true);
        env.MockFileSystemService.FileExists(Arg.Is<string>(p => p.EndsWith(".ldml"))).Returns(false);

        // SUT
        ParatextProject sourceProject = await env.Service.SendReceiveAsync(
            user01Secret,
            resourceId,
            null,
            default,
            Substitute.For<SyncMetrics>()
        );
        Assert.IsNotNull(sourceProject);
        Assert.IsInstanceOf(typeof(ParatextResource), sourceProject);
        env.MockFileSystemService.Received(1)
            .MoveFile(Arg.Is<string>(p => p.EndsWith("ldml.xml")), Arg.Is<string>(p => p.EndsWith(".ldml")));
    }

    [Test]
    public async Task SendReceiveAsync_SourceResource_DblLanguageDifferent()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
        env.SetupSuccessfulSendReceive();
        env.SetRestClientFactory(user01Secret);

        // Set up the Resource ScrText before it is installed on disk
        string resourceId = env.Resource3Id; // See the XML in SetRestClientFactory for this
        const string zipLanguageCode = "grc";
        using MockResourceScrText resourceScrText = env.GetResourceScrText(
            associatedPtUser,
            resourceId,
            "RV1895",
            zipLanguageCode
        );
        env.MockScrTextCollection.CreateResourceScrText(
                Arg.Any<string>(),
                Arg.Any<ProjectName>(),
                Arg.Any<IZippedResourcePasswordProvider>()
            )
            .Returns(resourceScrText);
        env.MockFileSystemService.FileExists(Arg.Is<string>(p => p.EndsWith(".p8z"))).Returns(true);
        await using var zipStream = await TestEnvironment.CreateZipStubAsync();
        env.MockFileSystemService.OpenFile(
                Arg.Is<string>(p => p.EndsWith(".p8z")),
                FileMode.Open,
                FileAccess.Read,
                FileShare.Read
            )
            .Returns(zipStream);
        await using var stream = new MemoryStream();
        env.MockFileSystemService.CreateFile(Arg.Any<string>()).Returns(stream);

        // Set up the Resource ScrText when it is installed on disk
        using MockScrText scrText = env.GetScrText(associatedPtUser, resourceId);
        env.MockScrTextCollection.FindById(Arg.Any<string>(), resourceId).Returns(scrText);
        ScrTextCollection.Initialize("/srv/scriptureforge/projects");

        // The FileManager will be disposed via the using statement in ParatextService.MigrateResourceIfRequired(),
        // so capture the saving of the settings here
        bool settingsSaved = false;
        scrText
            .FileManager.When(fm =>
                fm.WriteFileCreatingBackup("Settings.xml", Arg.Any<Action<string>>(), Arg.Any<Action<string>>())
            )
            .Do(_ => settingsSaved = true);

        // Set up the mock file system calls used by the migration
        env.MockFileSystemService.FileExists(Arg.Is<string>(p => p.EndsWith("ldml.xml"))).Returns(true);
        env.MockFileSystemService.FileExists(Arg.Is<string>(p => p.EndsWith(".ldml"))).Returns(false);

        // Confirm that the language code is different
        Assert.AreNotEqual(scrText.Settings.LanguageID.Code, zipLanguageCode);

        // SUT
        ParatextProject sourceProject = await env.Service.SendReceiveAsync(
            user01Secret,
            resourceId,
            null,
            default,
            Substitute.For<SyncMetrics>()
        );
        Assert.IsNotNull(sourceProject);
        Assert.IsInstanceOf(typeof(ParatextResource), sourceProject);
        env.MockFileSystemService.Received(1)
            .MoveFile(Arg.Is<string>(p => p.EndsWith("ldml.xml")), Arg.Is<string>(p => p.EndsWith(".ldml")));
        Assert.AreEqual(scrText.Settings.LanguageID.Code, zipLanguageCode);
        Assert.IsTrue(settingsSaved);
    }

    [Test]
    public async Task SendReceiveAsync_SourceResource_DblLanguageMissing()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
        env.SetupSuccessfulSendReceive();
        env.SetRestClientFactory(user01Secret);

        // Set up the Resource ScrText before it is installed on disk
        string resourceId = env.Resource3Id; // See the XML in SetRestClientFactory for this
        using MockResourceScrText resourceScrText = env.GetResourceScrText(associatedPtUser, resourceId, "RV1895");
        env.MockScrTextCollection.CreateResourceScrText(
                Arg.Any<string>(),
                Arg.Any<ProjectName>(),
                Arg.Any<IZippedResourcePasswordProvider>()
            )
            .Returns(resourceScrText);
        resourceScrText.Settings.LanguageID = null;

        // Mock a fresh installation by only showing the p8z as existing when the temp directory is created
        bool resourceDownloaded = false;
        env.MockFileSystemService.When(f => f.CreateDirectory(Arg.Any<string>())).Do(_ => resourceDownloaded = true);
        env.MockFileSystemService.FileExists(Arg.Is<string>(p => p.EndsWith(".p8z"))).Returns(_ => resourceDownloaded);
        await using var zipStream = await TestEnvironment.CreateZipStubAsync();
        env.MockFileSystemService.OpenFile(
                Arg.Is<string>(p => p.EndsWith(".p8z")),
                FileMode.Open,
                FileAccess.Read,
                FileShare.Read
            )
            .Returns(zipStream);
        await using var stream = new MemoryStream();
        env.MockFileSystemService.CreateFile(Arg.Any<string>()).Returns(stream);

        // Set up the Resource ScrText when it is installed on disk
        using MockScrText scrText = env.GetScrText(associatedPtUser, resourceId);
        env.MockScrTextCollection.FindById(Arg.Any<string>(), resourceId).Returns(scrText);
        ScrTextCollection.Initialize("/srv/scriptureforge/projects");

        // The FileManager will be disposed via the using statement in ParatextService.MigrateResourceIfRequired(),
        // so capture the saving of the settings here
        bool settingsSaved = false;
        scrText
            .FileManager.When(fm =>
                fm.WriteFileCreatingBackup("Settings.xml", Arg.Any<Action<string>>(), Arg.Any<Action<string>>())
            )
            .Do(_ => settingsSaved = true);

        // Set up the mock file system calls used by the migration
        env.MockFileSystemService.FileExists(Arg.Is<string>(p => p.EndsWith("ldml.xml"))).Returns(true);
        env.MockFileSystemService.FileExists(Arg.Is<string>(p => p.EndsWith(".ldml"))).Returns(false);

        // SUT
        ParatextProject sourceProject = await env.Service.SendReceiveAsync(
            user01Secret,
            resourceId,
            null,
            default,
            Substitute.For<SyncMetrics>()
        );
        Assert.IsNotNull(sourceProject);
        Assert.IsInstanceOf(typeof(ParatextResource), sourceProject);
        env.MockFileSystemService.Received(1)
            .MoveFile(Arg.Is<string>(p => p.EndsWith("ldml.xml")), Arg.Is<string>(p => p.EndsWith(".ldml")));
        Assert.AreEqual(resourceScrText.Settings.LanguageID?.Code, "en");
        Assert.IsTrue(settingsSaved);
    }

    [Test]
    public async Task SendReceiveAsync_SourceResource_Valid()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
        env.SetupSuccessfulSendReceive();
        env.SetRestClientFactory(user01Secret);
        ScrTextCollection.Initialize("/srv/scriptureforge/projects");
        string resourceId = env.Resource3Id; // See the XML in SetRestClientFactory for this
        ParatextProject targetProject = await env.Service.SendReceiveAsync(
            user01Secret,
            ptProjectId,
            null,
            default,
            Substitute.For<SyncMetrics>()
        );
        Assert.IsNotNull(targetProject);
        ParatextProject sourceProject = await env.Service.SendReceiveAsync(
            user01Secret,
            resourceId,
            null,
            default,
            Substitute.For<SyncMetrics>()
        );
        Assert.IsNotNull(sourceProject);
        Assert.IsInstanceOf(typeof(ParatextResource), sourceProject);
    }

    [Test]
    public async Task TryGetProjectRoleAsync_BadArguments()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        var attempt = await env.Service.TryGetProjectRoleAsync(null, "paratextIdHere", CancellationToken.None);
        Assert.That(attempt.Success, Is.False);
        Assert.That(attempt.Result, Is.Null);

        attempt = await env.Service.TryGetProjectRoleAsync(userSecret, null, CancellationToken.None);
        Assert.That(attempt.Success, Is.False);
        Assert.That(attempt.Result, Is.Null);
    }

    [Test]
    public async Task TryGetProjectRoleAsync_UsesTheRepositoryForUnregisteredProjects()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        env.SetSharedRepositorySource(userSecret, UserRoles.Administrator);
        var projects = await env.RealtimeService.GetRepository<SFProject>().GetAllAsync();
        var project = projects.First();
        env.MakeRegistryClientReturn(env.NotFoundHttpResponseMessage);
        // SUT
        var attempt = await env.Service.TryGetProjectRoleAsync(userSecret, project.ParatextId, CancellationToken.None);
        Assert.That(attempt.Success, Is.True);
        Assert.That(attempt.Result, Is.EqualTo(SFProjectRole.Administrator));
    }

    [Test]
    public async Task TryGetProjectRoleAsync_UsesTheRepositoryForUnregisteredProjectsAndFailsIfUserDoesntExist()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        // Notice that SetSharedRepositorySource is not called here
        var projects = await env.RealtimeService.GetRepository<SFProject>().GetAllAsync();
        var project = projects.First();
        env.MakeRegistryClientReturn(env.NotFoundHttpResponseMessage);
        // SUT
        var attempt = await env.Service.TryGetProjectRoleAsync(userSecret, project.ParatextId, CancellationToken.None);
        Assert.That(attempt.Success, Is.False);
        Assert.That(attempt.Result, Is.Empty);
    }

    [Test]
    public async Task GetParatextUsersAsync_UserNoLongerOnBackTranslationError()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User03, env.Username03, env.ParatextUserId03);
        env.SetSharedRepositorySource(userSecret, UserRoles.Administrator);
        var projects = await env.RealtimeService.GetRepository<SFProject>().GetAllAsync();
        SFProject project = projects.First();
        Assert.That(project.UserRoles.Count, Is.EqualTo(3), "setup");
        env.MakeRegistryClientReturn(env.NotFoundHttpResponseMessage);
        Assert.ThrowsAsync<ForbiddenException>(async () =>
            await env.Service.GetParatextUsersAsync(userSecret, project, CancellationToken.None)
        );
    }

    [Test]
    public async Task GetParatextUsersAsync_UsesTheRepositoryForUnregisteredProjects()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        TestEnvironment.MakeUserSecret(env.User02, env.Username02, env.ParatextUserId02);
        env.SetSharedRepositorySource(userSecret, UserRoles.Administrator);
        var projects = await env.RealtimeService.GetRepository<SFProject>().GetAllAsync();
        SFProject project = projects.First();
        Assert.That(project.UserRoles.Count, Is.EqualTo(3), "setup");
        env.MakeRegistryClientReturn(env.NotFoundHttpResponseMessage);
        // SUT
        IReadOnlyList<ParatextProjectUser> users = await env.Service.GetParatextUsersAsync(
            userSecret,
            project,
            CancellationToken.None
        );
        Assert.That(users.Count, Is.EqualTo(2));
        Assert.That(users.First(), Is.EqualTo(env.ParatextProjectUser01));
        Assert.That(users.Last(), Is.EqualTo(env.ParatextProjectUser02));
    }

    [Test]
    public async Task GetParatextUsersAsync_UsesTheRegistryForRegisteredProjects()
    {
        var env = new TestEnvironment();
        env.AddUserRepository();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        TestEnvironment.MakeUserSecret(env.User02, env.Username02, env.ParatextUserId02);
        var projects = await env.RealtimeService.GetRepository<SFProject>().GetAllAsync();
        SFProject project = projects.First();
        Assert.That(project.UserRoles.Count, Is.EqualTo(3), "setup");

        // Set up the OK request for IsRegisteredAsync()
        using HttpResponseMessage okResponse = TestEnvironment.MakeOkHttpResponseMessage($"\"{project.ParatextId}\"");
        env.MakeRegistryClientReturn(okResponse);

        // Set up the call of the list of users in the project
        using HttpResponseMessage usersResponse = TestEnvironment.MakeOkHttpResponseMessage(
            $$"""
            [
              {
                "role": "{{SFProjectRole.Administrator}}",
                "userId": "{{env.ParatextUserId01}}",
                "username": "{{env.Username01}}"
              },
              {
                "role": "{{SFProjectRole.Administrator}}",
                "userId": "{{env.ParatextUserId02}}",
                "username": "{{env.Username02}}"
              }
            ]
            """
        );
        env.MockRegistryHttpClient.SendAsync(
                Arg.Is<HttpRequestMessage>(r => r.RequestUri.ToString().Contains("/members")),
                CancellationToken.None
            )
            .Returns(usersResponse);

        // SUT
        IReadOnlyList<ParatextProjectUser> users = await env.Service.GetParatextUsersAsync(
            userSecret,
            project,
            CancellationToken.None
        );
        Assert.That(users.Count, Is.EqualTo(2));
        Assert.That(users.First(), Is.EqualTo(env.ParatextProjectUser01));
        Assert.That(users.Last(), Is.EqualTo(env.ParatextProjectUser02));
    }

    [Test]
    public async Task GetParatextUsersAsync_UnregisteredProject_SkipsNonPTUsers()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        TestEnvironment.MakeUserSecret(env.User02, env.Username02, env.ParatextUserId02);
        SFProject proj = env.NewSFProject();
        proj.UserRoles.Add(env.User04, SFProjectRole.CommunityChecker);
        env.AddProjectRepository(proj);
        env.SetSharedRepositorySource(userSecret, UserRoles.Administrator);
        var projects = await env.RealtimeService.GetRepository<SFProject>().GetAllAsync();
        SFProject project = projects.First();
        Assert.That(project.UserRoles.Count, Is.EqualTo(4), "setup");
        env.MakeRegistryClientReturn(env.NotFoundHttpResponseMessage);
        // SUT
        IReadOnlyList<ParatextProjectUser> users = await env.Service.GetParatextUsersAsync(
            userSecret,
            project,
            CancellationToken.None
        );
        Assert.That(users.Count, Is.EqualTo(2), "map of PT roles should only include PT users");
        Assert.That(users.First(), Is.EqualTo(env.ParatextProjectUser01));
        Assert.That(users.Last(), Is.EqualTo(env.ParatextProjectUser02));
    }

    [Test]
    public async Task GetParatextUsersAsync_UnregisteredProject_MoreInfoWhenHttpException()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        TestEnvironment.MakeUserSecret(env.User02, env.Username02, env.ParatextUserId02);
        IInternetSharedRepositorySource source = env.SetSharedRepositorySource(userSecret, UserRoles.Administrator);
        var projects = await env.RealtimeService.GetRepository<SFProject>().GetAllAsync();
        SFProject project = projects.First();
        // The 404 Not Found response here from the registry client lets us get into the
        // unregistered area of the SUT.
        env.MakeRegistryClientReturn(env.NotFoundHttpResponseMessage);

        source
            .GetRepositories()
            .Returns(x => throw HttpException.Create(new WebException("401: Unauthorized"), (HttpWebRequest)null));

        // SUT
        Assert.ThrowsAsync<HttpException>(() =>
            env.Service.GetParatextUsersAsync(userSecret, project, CancellationToken.None)
        );

        // Various pieces of significant data are reported when a 401 Unauthorized goes thru.
        string[] notes = ["unregistered", project.ParatextId, project.Id, userSecret.Id, "role"];
        env.MockLogger.AssertHasEvent(
            (LogEvent logEvent) => notes.All((string note) => logEvent.Message.Contains(note))
        );
    }

    [Test]
    public async Task IsRegisteredAsync_Works()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        using HttpResponseMessage okResponse = TestEnvironment.MakeOkHttpResponseMessage("\"some-project-pt-id\"");
        env.MakeRegistryClientReturn(okResponse);
        // One SUT
        Assert.That(
            await env.Service.IsRegisteredAsync(userSecret, "some-project-pt-id", CancellationToken.None),
            Is.True
        );

        env.MakeRegistryClientReturn(env.NotFoundHttpResponseMessage);
        // One SUT
        Assert.That(
            await env.Service.IsRegisteredAsync(userSecret, "some-project-pt-id", CancellationToken.None),
            Is.False
        );

        env.MakeRegistryClientReturn(env.UnauthorizedHttpResponseMessage);
        // One SUT
        HttpRequestException exc = Assert.ThrowsAsync<HttpRequestException>(() =>
            env.Service.IsRegisteredAsync(userSecret, "some-project-pt-id", CancellationToken.None)
        );
        Assert.That(exc.Message, Contains.Substring("Unauthorized"), "relevant error info should be coming thru");
    }

    [Test]
    public async Task GetParatextUsersAsync_ReturnsEmptyMappingForResourceProject()
    {
        var env = new TestEnvironment();
        const string resourceId = "1234567890abcdef";
        Assert.That(resourceId.Length, Is.EqualTo(SFInstallableDblResource.ResourceIdentifierLength));
        var userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        var mapping = await env.Service.GetParatextUsersAsync(
            userSecret,
            new SFProject { ParatextId = resourceId },
            CancellationToken.None
        );
        Assert.That(mapping.Count, Is.EqualTo(0));
    }

    enum SelectionType
    {
        Standard,
        RelatedVerse,
        Section,
        SectionEnd,
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
        public bool[] deletedNotes;
        public bool isConflict;
        public bool appliesToVerse;
        public string reattachedVerseStr;
        public bool doNotParseReattachedVerseStr;
        public bool editable;
        public int versionNumber;
    }

    record ReattachedThreadInfo
    {
        public string verseStr;
        public string selectedText;
        public string startPos;
        public string contextBefore;
        public string contextAfter;
    }

    struct ThreadNoteComponents
    {
        public string ownerRef;
        public Enum<NoteStatus> status;
        public string[] tagsAdded;
        public string assignedPTUser;
        public bool duplicate;
        public string content;
        public bool? editable;
        public int? versionNumber;
        public bool forceNullContent;
        public string? syncUserRef;
    }

    [Test]
    public void GetLatestSharedVersion_ForPTProject()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
        ScrText scrText = env.GetScrText(associatedPtUser, ptProjectId);
        string lastPublicRevision = "abc123";
        env.MockHgWrapper.GetLastPublicRevision(scrText.Directory).Returns(lastPublicRevision);

        // SUT
        string latestSharedVersion = env.Service.GetLatestSharedVersion(user01Secret, ptProjectId);

        Assert.That(latestSharedVersion, Is.EqualTo(lastPublicRevision));
    }

    [Test]
    public void GetLatestSharedVersion_ForDBLResource()
    {
        var env = new TestEnvironment();
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        string resourcePTId = "1234567890123456";
        Assert.That(
            resourcePTId,
            Has.Length.EqualTo(SFInstallableDblResource.ResourceIdentifierLength),
            "setup. Should be using a project ID that is a resource ID"
        );

        // SUT
        string latestSharedVersion = env.Service.GetLatestSharedVersion(user01Secret, resourcePTId);

        Assert.That(
            latestSharedVersion,
            Is.Null,
            "DBL resources do not have hg repositories to have a last pushed or pulled hg commit id."
        );
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
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
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
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
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
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
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
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
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
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
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
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
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
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
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
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
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
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        var associatedPtUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
        env.MockFileSystemService.FileExists(Arg.Any<string>()).Returns(true);

        // SUT
        bool result = env.Service.RestoreRepository(user01Secret, ptProjectId);
        Assert.IsTrue(result);
        env.MockHgWrapper.ReceivedWithAnyArgs().RestoreRepository(default, default);
        env.MockHgWrapper.ReceivedWithAnyArgs().MarkSharedChangeSetsPublic(default);
    }

    [Test]
    public void RestoreRepository_ExistingRestoredRepository_Success()
    {
        var env = new TestEnvironment();
        string scrtextDir = "/srv/scriptureforge/projects";
        ScrTextCollection.Initialize(scrtextDir);
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        var associatedPtUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
        env.MockFileSystemService.FileExists(Arg.Any<string>()).Returns(true);
        env.MockFileSystemService.DirectoryExists(Arg.Any<string>()).Returns(x => ((string)x[0]).Contains(ptProjectId));

        // SUT
        bool result = env.Service.RestoreRepository(user01Secret, ptProjectId);
        Assert.IsTrue(result);
        env.MockHgWrapper.ReceivedWithAnyArgs().RestoreRepository(default, default);
        env.MockHgWrapper.ReceivedWithAnyArgs().MarkSharedChangeSetsPublic(default);
        string projectRepository = Path.Join(scrtextDir, "_Backups", ptProjectId);
        string restoredRepository = projectRepository + "_Restored";
        // Removes leftover folders from a failed previous restore
        env.MockFileSystemService.Received().DeleteDirectory(projectRepository);
        env.MockFileSystemService.Received().DeleteDirectory(restoredRepository);
    }

    [Test]
    public void LocalProjectDirExists_Works()
    {
        var env = new TestEnvironment();
        Assert.That(env.Service.LocalProjectDirExists(env.PTProjectIds[env.Project01].Id), Is.True);
        Assert.That(env.Service.LocalProjectDirExists("not-existing"), Is.False);
    }

    [Test]
    public async Task CanUserAuthenticateToPTRegistryAsync_Works()
    {
        var env = new TestEnvironment();
        UserSecret user01Secret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        // One SUT
        Assert.ThrowsAsync<ArgumentNullException>(
            () => env.Service.CanUserAuthenticateToPTRegistryAsync(null),
            "throw on unacceptable input"
        );

        // One SUT
        Assert.ThrowsAsync<ArgumentException>(
            () =>
                env.Service.CanUserAuthenticateToPTRegistryAsync(new UserSecret() { Id = null, ParatextTokens = null }),
            "the user secret does not have usable content"
        );

        env.MakeRegistryClientReturn(env.UnauthorizedHttpResponseMessage);

        // One SUT
        Assert.That(
            await env.Service.CanUserAuthenticateToPTRegistryAsync(user01Secret),
            Is.False,
            "authorization token is not accepted by server. unauthorized."
        );

        using HttpResponseMessage okResponse = TestEnvironment.MakeOkHttpResponseMessage(
            @"{
                    ""sub"": ""ptUserIdCode11111"",
                }"
        );
        env.MakeRegistryClientReturn(okResponse);

        // One SUT
        Assert.That(
            await env.Service.CanUserAuthenticateToPTRegistryAsync(user01Secret),
            Is.True,
            "authorization token is accepted by server"
        );
    }

    [Test]
    public async Task CanUserAuthenticateToPTArchivesAsync_Works()
    {
        var env = new TestEnvironment();
        TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        string userSFId = env.User01;

        // One SUT
        Assert.ThrowsAsync<ArgumentException>(
            () => env.Service.CanUserAuthenticateToPTArchivesAsync(null),
            "unacceptable null input"
        );

        // One SUT
        Assert.ThrowsAsync<ArgumentException>(
            () => env.Service.CanUserAuthenticateToPTArchivesAsync(string.Empty),
            "unacceptable empty input"
        );

        IInternetSharedRepositorySource mockSource = Substitute.For<IInternetSharedRepositorySource>();

        env.MockInternetSharedRepositorySourceProvider.GetSource(
                Arg.Any<UserSecret>(),
                Arg.Any<string>(),
                Arg.Any<string>()
            )
            .Returns(mockSource);
        mockSource.CanUserAuthenticateToPTArchives().Returns(false);

        // One SUT
        Assert.That(await env.Service.CanUserAuthenticateToPTArchivesAsync(userSFId), Is.False, "unauthorized");

        mockSource.CanUserAuthenticateToPTArchives().Returns(true);

        // One SUT
        Assert.That(await env.Service.CanUserAuthenticateToPTArchivesAsync(userSFId), Is.True, "authorized");
    }

    [Test]
    public void ResourceDocsNeedUpdating_NotResource()
    {
        // Setup test environment
        var env = new TestEnvironment();
        var project = new SFProject { ParatextId = env.PTProjectIds[env.Project01].Id };
        var resource = new ParatextResource();

        // SUT
        var result = env.Service.ResourceDocsNeedUpdating(project, resource);
        Assert.That(env.Service.IsResource(project.ParatextId), Is.False);
        Assert.That(result, Is.True);
    }

    [Test]
    public void ResourceDocsNeedUpdating_NoResourceConfig()
    {
        // Setup test environment
        var env = new TestEnvironment();
        var project = new SFProject { ParatextId = env.Resource1Id };
        var resource = new ParatextResource();

        // SUT
        var result = env.Service.ResourceDocsNeedUpdating(project, resource);
        Assert.That(env.Service.IsResource(project.ParatextId), Is.True);
        Assert.That(result, Is.True);
    }

    [Test]
    public void ResourceDocsNeedUpdating_NotChanged_SameTimestamp()
    {
        // Setup test environment
        var env = new TestEnvironment();
        var timestamp = DateTime.Now;
        var project = new SFProject
        {
            ParatextId = env.Resource1Id,
            ResourceConfig = new ResourceConfig
            {
                CreatedTimestamp = timestamp,
                ManifestChecksum = "manifest1",
                PermissionsChecksum = "permissions1",
                Revision = 1,
            },
        };
        var resource = new ParatextResource
        {
            AvailableRevision = 1,
            CreatedTimestamp = timestamp,
            ManifestChecksum = "manifest1",
            PermissionsChecksum = "permissions1",
        };

        // SUT
        var result = env.Service.ResourceDocsNeedUpdating(project, resource);
        Assert.That(env.Service.IsResource(project.ParatextId), Is.True);
        Assert.That(result, Is.False);
    }

    [Test]
    public void ResourceDocsNeedUpdating_NotChanged_DifferentTimestamp()
    {
        // Setup test environment
        var env = new TestEnvironment();
        var timestamp = DateTime.Now;
        var project = new SFProject
        {
            ParatextId = env.Resource1Id,
            ResourceConfig = new ResourceConfig
            {
                CreatedTimestamp = timestamp,
                ManifestChecksum = "manifest1",
                PermissionsChecksum = "permissions1",
                Revision = 1,
            },
        };
        var resource = new ParatextResource
        {
            AvailableRevision = 1,
            CreatedTimestamp = timestamp.AddHours(1),
            ManifestChecksum = "manifest1",
            PermissionsChecksum = "permissions1",
        };

        // SUT
        var result = env.Service.ResourceDocsNeedUpdating(project, resource);
        Assert.That(env.Service.IsResource(project.ParatextId), Is.True);
        Assert.That(result, Is.False);
    }

    [Test]
    public void ResourceDocsNeedUpdating_DifferentManifest_EarlierTimestamp()
    {
        // Setup test environment
        var env = new TestEnvironment();
        var timestamp = DateTime.Now;
        var project = new SFProject
        {
            ParatextId = env.Resource1Id,
            ResourceConfig = new ResourceConfig
            {
                CreatedTimestamp = timestamp,
                ManifestChecksum = "manifest1",
                PermissionsChecksum = "permissions1",
                Revision = 1,
            },
        };
        var resource = new ParatextResource
        {
            AvailableRevision = 1,
            CreatedTimestamp = timestamp.AddHours(-1),
            ManifestChecksum = "manifest2",
            PermissionsChecksum = "permissions1",
        };

        // SUT
        var result = env.Service.ResourceDocsNeedUpdating(project, resource);
        Assert.That(env.Service.IsResource(project.ParatextId), Is.True);
        Assert.That(result, Is.False);
    }

    [Test]
    public void ResourceDocsNeedUpdating_DifferentManifest_LaterTimestamp()
    {
        // Setup test environment
        var env = new TestEnvironment();
        var timestamp = DateTime.Now;
        var project = new SFProject
        {
            ParatextId = env.Resource1Id,
            ResourceConfig = new ResourceConfig
            {
                CreatedTimestamp = timestamp,
                ManifestChecksum = "manifest1",
                PermissionsChecksum = "permissions1",
                Revision = 1,
            },
        };
        var resource = new ParatextResource
        {
            AvailableRevision = 1,
            CreatedTimestamp = timestamp.AddHours(1),
            ManifestChecksum = "manifest2",
            PermissionsChecksum = "permissions1",
        };

        // SUT
        var result = env.Service.ResourceDocsNeedUpdating(project, resource);
        Assert.That(env.Service.IsResource(project.ParatextId), Is.True);
        Assert.That(result, Is.True);
    }

    [Test]
    public void ResourceDocsNeedUpdating_LaterRevision()
    {
        // Setup test environment
        var env = new TestEnvironment();
        var timestamp = DateTime.Now;
        var project = new SFProject
        {
            ParatextId = env.Resource1Id,
            ResourceConfig = new ResourceConfig
            {
                CreatedTimestamp = timestamp,
                ManifestChecksum = "manifest1",
                PermissionsChecksum = "permissions1",
                Revision = 1,
            },
        };
        var resource = new ParatextResource
        {
            AvailableRevision = 2,
            CreatedTimestamp = timestamp,
            ManifestChecksum = "manifest1",
            PermissionsChecksum = "permissions1",
        };

        // SUT
        var result = env.Service.ResourceDocsNeedUpdating(project, resource);
        Assert.That(env.Service.IsResource(project.ParatextId), Is.True);
        Assert.That(result, Is.True);
    }

    [Test]
    public void ResourceDocsNeedUpdating_ChangedPermissions()
    {
        // Setup test environment
        var env = new TestEnvironment();
        var timestamp = DateTime.Now;
        var project = new SFProject
        {
            ParatextId = env.Resource1Id,
            ResourceConfig = new ResourceConfig
            {
                CreatedTimestamp = timestamp,
                ManifestChecksum = "manifest1",
                PermissionsChecksum = "permissions1",
                Revision = 1,
            },
        };
        var resource = new ParatextResource
        {
            AvailableRevision = 1,
            CreatedTimestamp = timestamp,
            ManifestChecksum = "manifest1",
            PermissionsChecksum = "permissions2",
        };

        // SUT
        var result = env.Service.ResourceDocsNeedUpdating(project, resource);
        Assert.That(env.Service.IsResource(project.ParatextId), Is.True);
        Assert.That(result, Is.True);
    }

    [Test]
    public void SetRepoToRevision_SetsAndChecks()
    {
        TestEnvironment env = new();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string projectPTId = env.SetupProject(env.Project01, associatedPtUser);
        string rev = "some-desired-revision";
        env.MockHgWrapper.GetRepoRevision(
                Arg.Is<string>((string repoPath) => repoPath.EndsWith(Path.Join(projectPTId, "target")))
            )
            .Returns(rev);
        // SUT
        env.Service.SetRepoToRevision(
            TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01),
            projectPTId,
            rev
        );
        env.MockHgWrapper.Received().Update(Arg.Any<string>(), rev);
        env.MockHgWrapper.Received().GetRepoRevision(Arg.Any<string>());
    }

    [Test]
    public void SetRepoToRevision_DetectsProblem()
    {
        TestEnvironment env = new();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string projectPTId = env.SetupProject(env.Project01, associatedPtUser);
        string rev = "some-desired-new-revision";
        string wrongRev = "not-the-rev-we-wanted";
        env.MockHgWrapper.GetRepoRevision(Arg.Any<string>()).Returns(wrongRev);
        // SUT
        Assert.Throws<Exception>(() =>
            env.Service.SetRepoToRevision(
                TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01),
                projectPTId,
                rev
            )
        );
        env.MockHgWrapper.Received().Update(Arg.Any<string>(), rev);
        env.MockHgWrapper.Received().GetRepoRevision(Arg.Any<string>());
    }

    [Test]
    public void GetWritingSystem_GetsTheLanguageIdFromTheScrText()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        // SUT
        var actual = env.Service.GetWritingSystem(userSecret, ptProjectId);
        Assert.IsNull(actual.Region);
        Assert.AreEqual("Latn", actual.Script);
        Assert.AreEqual(LanguageId.English.Id, actual.Tag);
    }

    [Test]
    public void GetWritingSystem_Arabic()
    {
        _ = new TestEnvironment();
        const string languageTag = "ar";

        // SUT
        var actual = ParatextService.GetWritingSystem(languageTag);
        Assert.IsNull(actual.Region);
        Assert.AreEqual("Arab", actual.Script);
        Assert.AreEqual(languageTag, actual.Tag);
    }

    [Test]
    public void GetWritingSystem_StandardArabic()
    {
        _ = new TestEnvironment();
        const string languageTag = "arb";

        // SUT
        var actual = ParatextService.GetWritingSystem(languageTag);
        Assert.IsNull(actual.Region);
        Assert.IsNull(actual.Script);
        Assert.AreEqual(languageTag, actual.Tag);
    }

    [Test]
    public void GetWritingSystem_USEnglish()
    {
        _ = new TestEnvironment();
        const string languageTag = "en-US";

        // SUT
        var actual = ParatextService.GetWritingSystem(languageTag);
        Assert.AreEqual("US", actual.Region);
        Assert.AreEqual("Latn", actual.Script);
        Assert.AreEqual(languageTag, actual.Tag);
    }

    [Test]
    public void ClearParatextDataCaches_InvalidProjectSuccess()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        // SUT
        env.Service.ClearParatextDataCaches(userSecret, "invalid_project_id");
    }

    [Test]
    public void ClearParatextDataCaches_Success()
    {
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        // SUT
        env.Service.ClearParatextDataCaches(userSecret, ptProjectId);
    }

    [Test]
    public void GetChaptersAsUsj_InvalidUserSecret()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = new UserSecret();
        env.MockJwtTokenHelper.GetParatextUsername(userSecret).Returns(_ => null);
        string paratextId = env.PTProjectIds[env.Project01].ToString();

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(() =>
        {
            foreach (var _ in env.Service.GetChaptersAsUsj(userSecret, paratextId, 8, env.RuthBookUsfm)) { }
            return null;
        });
    }

    [Test]
    public void GetChaptersAsUsj_MissingProject()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        const string paratextId = "invalid_paratext_id";

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
        {
            foreach (var _ in env.Service.GetChaptersAsUsj(userSecret, paratextId, 8, env.RuthBookUsfm)) { }
            return null;
        });
    }

    [Test]
    public void GetChaptersAsUsj_MissingChapter()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        var associatedPtUser = new SFParatextUser(env.Username01);
        env.SetupProject(env.Project01, associatedPtUser);
        string paratextId = env.PTProjectIds[env.Project01].ToString();
        string usfm = $"{env.RuthBookUsfm}\n\\c 3\n\\v 1 Chapter 3 Verse 1 here.";
        List<Usj> expected =
        [
            env.RuthBookUsj,
            new Usj
            {
                Type = Usj.UsjType,
                Version = Usj.UsjVersion,
                Content = [],
            },
            new Usj
            {
                Type = Usj.UsjType,
                Version = Usj.UsjVersion,
                Content =
                [
                    new UsjMarker
                    {
                        Marker = "c",
                        Number = "3",
                        Type = "chapter",
                    },
                    new UsjMarker
                    {
                        Marker = "v",
                        Number = "1",
                        Type = "verse",
                    },
                    "Chapter 3 Verse 1 here.",
                ],
            },
        ];

        // SUT
        List<Usj> actual = [.. env.Service.GetChaptersAsUsj(userSecret, paratextId, 8, usfm)];
        Assert.That(actual, Is.EqualTo(expected).UsingPropertiesComparer());
    }

    [Test]
    public void GetChaptersAsUsj_Success()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        var associatedPtUser = new SFParatextUser(env.Username01);
        env.SetupProject(env.Project01, associatedPtUser);
        string paratextId = env.PTProjectIds[env.Project01].ToString();

        // SUT
        var actual = env.Service.GetChaptersAsUsj(userSecret, paratextId, 8, env.RuthBookUsfm);
        Assert.That(actual.Single(), Is.EqualTo(env.RuthBookUsj).UsingPropertiesComparer());
    }

    [Test]
    public void ConvertUsxToUsfm_InvalidUserSecret()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = new UserSecret();
        env.MockJwtTokenHelper.GetParatextUsername(userSecret).Returns(_ => null);
        string paratextId = env.PTProjectIds[env.Project01].ToString();

        // SUT
        Assert.Throws<ForbiddenException>(() => env.Service.ConvertUsxToUsfm(userSecret, paratextId, 8, env.RuthBookUsx)
        );
    }

    [Test]
    public void ConvertUsxToUsfm_MissingProject()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        const string paratextId = "invalid_paratext_id";

        // SUT
        Assert.Throws<DataNotFoundException>(() =>
            env.Service.ConvertUsxToUsfm(userSecret, paratextId, 8, env.RuthBookUsx)
        );
    }

    [Test]
    public void ConvertUsxToUsfm_Success()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        var associatedPtUser = new SFParatextUser(env.Username01);
        env.SetupProject(env.Project01, associatedPtUser);
        string paratextId = env.PTProjectIds[env.Project01].ToString();

        // SUT
        string actual = env.Service.ConvertUsxToUsfm(userSecret, paratextId, 8, env.RuthBookUsx);
        Assert.That(actual, Is.EqualTo(env.RuthBookUsfm));
    }

    [Test]
    public async Task GetRevisionHistoryAsync_DoesNotCrashWhenASyncUpdatesTheParatextRevisions()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        var associatedPtUser = new SFParatextUser(env.Username01);
        env.SetupProject(env.Project01, associatedPtUser);
        SFProject project = env.NewSFProject();
        project.UserRoles = new Dictionary<string, string> { { env.User01, SFProjectRole.PTObserver } };
        env.AddProjectRepository(project);
        env.AddTextDataOps(project.Id, "RUT", 1);
        env.ProjectHgRunner.SetStandardOutput(env.RuthBookUsfm, true);

        // SUT
        bool historyExists = false;
        int count = 0;
        await foreach (
            DocumentRevision revision in env.Service.GetRevisionHistoryAsync(userSecret, project.Id, "RUT", 1)
        )
        {
            // This will loop through the 4 valid ops in MemoryConnection.GetOpsAsync() then the 1 revision in MockHg._log
            historyExists = true;
            count++;

            // Check the op sources
            if (count == 4)
            {
                // The last revision should be the one from MockHg._log
                Assert.AreEqual(revision.Source, OpSource.Paratext);
            }
            else if (count == 1)
            {
                // The first revision has a valid source
                Assert.AreEqual(revision.Source, OpSource.Draft);
            }
            else
            {
                // The others do not
                Assert.IsNull(revision.Source);
            }

            // Simulate a sync updating the revisions on disk
            WriteLock writeLock = WriteLockManager.Default.ObtainLock(WriteScope.ProjectRepository(env.ProjectScrText));
            writeLock.ReleaseAndNotify();
        }

        Assert.AreEqual(4, count);
        Assert.IsTrue(historyExists);
    }

    [Test]
    public void GetRevisionHistoryAsync_InsufficientPermissions()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        SFProject project = env.NewSFProject();
        project.UserRoles = new Dictionary<string, string> { { env.User01, SFProjectRole.Commenter } };
        env.AddProjectRepository(project);

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(async () =>
        {
            await foreach (var _ in env.Service.GetRevisionHistoryAsync(userSecret, project.Id, "MAT", 1)) { }
        });
    }

    [Test]
    public void GetRevisionHistoryAsync_MissingProject()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(async () =>
        {
            await foreach (var _ in env.Service.GetRevisionHistoryAsync(userSecret, "invalid_project_id", "MAT", 1)) { }
        });
    }

    [Test]
    public void GetRevisionHistoryAsync_MissingUser()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        SFProject project = env.NewSFProject();
        project.UserRoles = [];
        env.AddProjectRepository(project);

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(async () =>
        {
            await foreach (var _ in env.Service.GetRevisionHistoryAsync(userSecret, project.Id, "MAT", 1)) { }
        });
    }

    [Test]
    public async Task GetRevisionHistoryAsync_MissingParatextDirectory()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        var associatedPtUser = new SFParatextUser(env.Username01);
        env.SetupProject(env.Project01, associatedPtUser);
        SFProject project = env.NewSFProject();
        project.UserRoles = new Dictionary<string, string> { { env.User01, SFProjectRole.PTObserver } };
        env.AddProjectRepository(project);
        env.AddTextDataOps(project.Id, "MAT", 1);
        env.MockScrTextCollection.FindById(Arg.Any<string>(), Arg.Any<string>()).ReturnsNull();

        // SUT
        bool historyExists = false;
        await foreach (DocumentRevision _ in env.Service.GetRevisionHistoryAsync(userSecret, project.Id, "MAT", 1))
        {
            historyExists = true;
        }

        Assert.IsTrue(historyExists);
    }

    [Test]
    public async Task GetRevisionHistoryAsync_NoBookChangesInMercurial()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        var associatedPtUser = new SFParatextUser(env.Username01);
        env.SetupProject(env.Project01, associatedPtUser);
        SFProject project = env.NewSFProject();
        project.UserRoles = new Dictionary<string, string> { { env.User01, SFProjectRole.PTObserver } };
        env.AddProjectRepository(project);
        env.AddTextDataOps(project.Id, "MAT", 1);
        env.ProjectHgRunner.SetStandardOutput(string.Empty, false);

        // SUT
        bool historyExists = false;
        int count = 0;
        await foreach (
            DocumentRevision revision in env.Service.GetRevisionHistoryAsync(userSecret, project.Id, "MAT", 1)
        )
        {
            // This will loop through the 4 valid ops (combined to 3) in MemoryConnection.GetOpsAsync()
            // and skip the 1 revision in MockHg._log
            historyExists = true;
            count++;

            // Check the op sources
            if (count == 1)
            {
                // The first revision has a valid source
                Assert.AreEqual(revision.Source, OpSource.Draft);
            }
            else
            {
                // The others do not
                Assert.IsNull(revision.Source);
            }
        }

        Assert.AreEqual(3, count);
        Assert.IsTrue(historyExists);
    }

    [Test]
    public async Task GetRevisionHistoryAsync_Success()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        var associatedPtUser = new SFParatextUser(env.Username01);
        env.SetupProject(env.Project01, associatedPtUser);
        SFProject project = env.NewSFProject();
        project.UserRoles = new Dictionary<string, string> { { env.User01, SFProjectRole.PTObserver } };
        env.AddProjectRepository(project);
        env.AddTextDataOps(project.Id, "MAT", 1);

        // SUT
        bool historyExists = false;
        await foreach (
            DocumentRevision revision in env.Service.GetRevisionHistoryAsync(userSecret, project.Id, "MAT", 1)
        )
        {
            // NOTE: These values are defined in MemoryConnection.GetOpsAsync()
            Assert.IsTrue(revision.Timestamp > DateTime.MinValue);
            Assert.AreEqual(revision.UserId, env.User01);
            Assert.AreEqual(revision.Source, OpSource.Draft);
            historyExists = true;
            break;
        }

        Assert.IsTrue(historyExists);
    }

    [Test]
    public async Task GetSnapshotAsync_FetchesEarliestSnapshotFromParatext()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        SFProject project = env.NewSFProject();
        project.UserRoles = new Dictionary<string, string> { { env.User01, SFProjectRole.PTObserver } };
        env.AddProjectRepository(project);
        const string book = "RUT";
        const int chapter = 1;
        env.RealtimeService.AddRepository("texts", OTType.RichText, new MemoryRepository<TextData>());
        env.ProjectHgRunner.SetStandardOutput(env.RuthBookUsfm, true);
        TextData textData = env.GetTextDoc(Canon.BookIdToNumber(book), chapter);

        var associatedPtUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
        ScrText scrText = env.GetScrText(associatedPtUser, ptProjectId);

        env.MockScrTextCollection.FindById(Arg.Any<string>(), Arg.Any<string>()).Returns(_ => scrText);
        env.MockDeltaUsxMapper.ToChapterDeltas(Arg.Any<XDocument>())
            .Returns([new ChapterDelta(chapter, 1, false, textData)]);

        // SUT
        var actual = await env.Service.GetSnapshotAsync(userSecret, project.Id, book, chapter, DateTime.MinValue);
        Assert.AreEqual(textData.Ops.First(), actual.Data.Ops.First());
        Assert.AreEqual(textData.Id, actual.Id);
        Assert.AreEqual(0, actual.Version);
        Assert.AreEqual(false, actual.IsValid);
    }

    [Test]
    public async Task GetSnapshotAsync_FetchesSpecifiedSnapshotFromParatext()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        SFProject project = env.NewSFProject();
        project.UserRoles = new Dictionary<string, string> { { env.User01, SFProjectRole.PTObserver } };
        env.AddProjectRepository(project);
        const string book = "RUT";
        const int chapter = 1;
        env.RealtimeService.AddRepository("texts", OTType.RichText, new MemoryRepository<TextData>());
        env.ProjectHgRunner.SetStandardOutput(env.RuthBookUsfm, true);
        TextData textData = env.GetTextDoc(Canon.BookIdToNumber(book), chapter);

        var associatedPtUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
        ScrText scrText = env.GetScrText(associatedPtUser, ptProjectId);

        env.MockScrTextCollection.FindById(Arg.Any<string>(), Arg.Any<string>()).Returns(_ => scrText);
        env.MockDeltaUsxMapper.ToChapterDeltas(Arg.Any<XDocument>())
            .Returns([new ChapterDelta(chapter, 1, false, textData)]);

        // SUT
        var actual = await env.Service.GetSnapshotAsync(userSecret, project.Id, book, chapter, DateTime.UtcNow);
        Assert.AreEqual(textData.Ops.First(), actual.Data.Ops.First());
        Assert.AreEqual(textData.Id, actual.Id);
        Assert.AreEqual(0, actual.Version);
        Assert.AreEqual(false, actual.IsValid);
    }

    [Test]
    public async Task GetSnapshotAsync_FetchesSnapshotFromRealtimeServer()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        SFProject project = env.NewSFProject();
        project.UserRoles = new Dictionary<string, string> { { env.User01, SFProjectRole.PTObserver } };
        env.AddProjectRepository(project);
        const string book = "MAT";
        const int chapter = 1;
        TextData textData = env.AddTextDoc(Canon.BookIdToNumber(book), chapter);

        var associatedPtUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
        ScrText scrText = env.GetScrText(associatedPtUser, ptProjectId);

        env.MockScrTextCollection.FindById(Arg.Any<string>(), Arg.Any<string>()).Returns(_ => scrText);
        env.MockDeltaUsxMapper.ToChapterDeltas(Arg.Any<XDocument>())
            .Returns([new ChapterDelta(chapter, 1, false, textData)]);

        // SUT
        var actual = await env.Service.GetSnapshotAsync(userSecret, project.Id, book, chapter, DateTime.UtcNow);
        Assert.AreEqual(textData.Ops.First(), actual.Data.Ops.First());
        Assert.AreEqual(textData.Id, actual.Id);
        Assert.AreEqual(0, actual.Version);
        Assert.AreEqual(false, actual.IsValid);
    }

    [Test]
    public void GetSnapshotAsync_InsufficientPermissions()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        SFProject project = env.NewSFProject();
        project.UserRoles = new Dictionary<string, string> { { env.User01, SFProjectRole.Commenter } };
        env.AddProjectRepository(project);

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(() =>
            env.Service.GetSnapshotAsync(userSecret, project.Id, "MAT", 1, DateTime.UtcNow)
        );
    }

    [Test]
    public void GetSnapshotAsync_MissingProject()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.GetSnapshotAsync(userSecret, "invalid_project_id", "MAT", 1, DateTime.UtcNow)
        );
    }

    [Test]
    public void GetSnapshotAsync_MissingUser()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        SFProject project = env.NewSFProject();
        project.UserRoles = [];
        env.AddProjectRepository(project);

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(() =>
            env.Service.GetSnapshotAsync(userSecret, project.Id, "MAT", 1, DateTime.UtcNow)
        );
    }

    [Test]
    public void GetSnapshotAsync_NoParatextRevisions()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        SFProject project = env.NewSFProject();
        project.UserRoles = new Dictionary<string, string> { { env.User01, SFProjectRole.PTObserver } };
        env.AddProjectRepository(project);
        env.RealtimeService.AddRepository("texts", OTType.RichText, new MemoryRepository<TextData>());
        env.ProjectHg.Log.Clear();

        var associatedPtUser = new SFParatextUser(env.Username01);
        string ptProjectId = env.SetupProject(env.Project01, associatedPtUser);
        ScrText scrText = env.GetScrText(associatedPtUser, ptProjectId);

        env.MockScrTextCollection.FindById(Arg.Any<string>(), Arg.Any<string>()).Returns(_ => scrText);

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.GetSnapshotAsync(userSecret, project.Id, "RUT", 1, DateTime.MinValue)
        );
    }

    [Test]
    public void GetDeltaFromUsfmAsync_MissingProject()
    {
        // Setup the test environment
        var env = new TestEnvironment();
        SFProject project = env.NewSFProject();
        env.AddProjectRepository(project);
        env.SetupProject(env.Project01, new SFParatextUser(env.Username01));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.GetDeltaFromUsfmAsync(env.User01, "invalid_project_id", env.RuthBookUsfm, 8)
        );
    }

    [Test]
    public void GetDeltaFromUsfmAsync_MissingUserSecret()
    {
        // Setup the test environment
        var env = new TestEnvironment();
        SFProject project = env.NewSFProject();
        env.AddProjectRepository(project);
        env.SetupProject(env.Project01, new SFParatextUser(env.Username01));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.GetDeltaFromUsfmAsync("invalid_user_id", project.Id, env.RuthBookUsfm, 8)
        );
    }

    [Test]
    public async Task GetDeltaFromUsfmAsync_Success()
    {
        // Setup the test environment
        var env = new TestEnvironment();
        SFProject project = env.NewSFProject();
        env.AddProjectRepository(project);
        env.SetupProject(env.Project01, new SFParatextUser(env.Username01));

        // Create the expected delta
        JToken token1 = JToken.Parse("{\"insert\": { \"chapter\": { \"number\": \"1\", \"style\": \"c\" } } }");
        JToken token2 = JToken.Parse("{\"insert\": { \"verse\": { \"number\": \"1\", \"style\": \"v\" } } }");
        JToken token3 = JToken.Parse(
            "{\"insert\": \"Verse 1 here. \", \"attributes\": { \"segment\": \"verse_1_1\" } }"
        );
        JToken token4 = JToken.Parse("{\"insert\": { \"verse\": { \"number\": \"2\", \"style\": \"v\" } } }");
        JToken token5 = JToken.Parse(
            "{\"insert\": \"Verse 2 here.\"," + "\"attributes\": { \"segment\": \"verse_1_2\" } }"
        );
        JToken token6 = JToken.Parse("{\"insert\": \"\n\" }");
        Delta expected = new Delta([token1, token2, token3, token4, token5, token6]);

        env.MockDeltaUsxMapper.ToChapterDeltas(Arg.Any<XDocument>())
            .Returns([new ChapterDelta(-1, -1, false, expected)]);

        // SUT
        var delta = await env.Service.GetDeltaFromUsfmAsync(env.User01, project.Id, env.RuthBookUsfm, 8);
        Assert.IsTrue(delta.DeepEquals(expected));
    }

    [Test]
    public async Task GetDeltaFromUsfmAsync_WithVariantBookId()
    {
        // Set up the test environment
        var env = new TestEnvironment();
        SFProject project = env.NewSFProject();
        env.AddProjectRepository(project);
        env.SetupProject(env.Project01, new SFParatextUser(env.Username01));

        // Create the expected delta
        JToken token1 = JToken.Parse("{\"insert\": { \"chapter\": { \"number\": \"1\", \"style\": \"c\" } } }");
        JToken token2 = JToken.Parse("{\"insert\": { \"verse\": { \"number\": \"1\", \"style\": \"v\" } } }");
        JToken token3 = JToken.Parse(
            "{\"insert\": \"Verse 1 here. \", \"attributes\": { \"segment\": \"verse_1_1\" } }"
        );
        JToken token4 = JToken.Parse("{\"insert\": { \"verse\": { \"number\": \"2\", \"style\": \"v\" } } }");
        JToken token5 = JToken.Parse(
            "{\"insert\": \"Verse 2 here.\"," + "\"attributes\": { \"segment\": \"verse_1_2\" } }"
        );
        JToken token6 = JToken.Parse("{\"insert\": \"\n\" }");
        Delta expected = new Delta([token1, token2, token3, token4, token5, token6]);

        env.MockDeltaUsxMapper.ToChapterDeltas(Arg.Any<XDocument>())
            .Returns([new ChapterDelta(-1, -1, false, expected)]);

        const string ruthBookUsfm =
            "\\id Rut - ProjectNameHere\n" + "\\c 1\n" + "\\v 1 Verse 1 here.\n" + "\\v 2 Verse 2 here.";
        ;

        // SUT
        var delta = await env.Service.GetDeltaFromUsfmAsync(env.User01, project.Id, ruthBookUsfm, 8);
        Assert.IsTrue(delta.DeepEquals(expected));
    }

    [Test]
    public async Task GetBiblicalTermsAsync_AllBiblicalTerms()
    {
        // Setup the test environment
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        env.SetupProject(env.Project01, new SFParatextUser(env.Username01));

        // Setup Biblical Terms
        string settingValue = $"{BiblicalTermsListType.All}::BiblicalTerms.xml";
        env.ProjectScrText.Settings.SetSetting(Setting.BiblicalTermsListSetting, settingValue);

        // SUT
        BiblicalTermsChanges actual = await env.Service.GetBiblicalTermsAsync(
            userSecret,
            env.PTProjectIds[env.Project01].Id,
            books: [40]
        );

        // There are 1587 All Biblical Terms in Matthew
        Assert.AreEqual(actual.BiblicalTerms.Count, 1587);
        Assert.IsEmpty(actual.ErrorMessage);
        Assert.AreEqual(actual.ErrorCode, BiblicalTermErrorCode.None);
        Assert.IsFalse(actual.HasRenderings);
    }

    [Test]
    public async Task GetBiblicalTermsAsync_InvalidProjectBiblicalTermsConfiguration()
    {
        // Setup the test environment
        var env = new TestEnvironment();
        SFProject project = env.NewSFProject();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        env.SetupProject(env.Project01, new SFParatextUser(env.Username01));

        // Setup Biblical Terms
        string settingValue = $":{project.ShortName}:BiblicalTerms.xml";
        env.ProjectScrText.Settings.SetSetting(Setting.BiblicalTermsListSetting, settingValue);

        // SUT
        BiblicalTermsChanges actual = await env.Service.GetBiblicalTermsAsync(
            userSecret,
            project.ParatextId,
            books: [40]
        );

        // Code will fall back to Major Biblical Terms.
        // There are 580 Major Biblical Terms in Matthew
        Assert.AreEqual(actual.BiblicalTerms.Count, 580);
        Assert.IsEmpty(actual.ErrorMessage);
        Assert.AreEqual(actual.ErrorCode, BiblicalTermErrorCode.None);
        Assert.IsFalse(actual.HasRenderings);
    }

    [Test]
    public async Task GetBiblicalTermsAsync_MajorBiblicalTerms()
    {
        // Setup the test environment
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        env.SetupProject(env.Project01, new SFParatextUser(env.Username01));

        // Setup term rendering
        const string termId = "Ἀβιά-1";
        const string rendering = "Abijah";
        env.ProjectFileManager.GetXml<TermRenderingsList>(Arg.Any<string>())
            .Returns(
                new TermRenderingsList
                {
                    RenderingsInternal = [new TermRendering { Id = termId, RenderingsInternal = rendering }],
                }
            );

        // SUT
        BiblicalTermsChanges actual = await env.Service.GetBiblicalTermsAsync(
            userSecret,
            env.PTProjectIds[env.Project01].Id,
            books: [40]
        );

        // Confirm there is only one rendering, and that rendering is our rendering
        Assert.AreEqual(actual.BiblicalTerms.First().TermId, termId);
        Assert.AreEqual(actual.BiblicalTerms.First().Renderings.Single(), rendering);
        Assert.AreEqual(actual.BiblicalTerms.SelectMany(bt => bt.Renderings).Count(), 1);
        Assert.IsEmpty(actual.ErrorMessage);
        Assert.AreEqual(actual.ErrorCode, BiblicalTermErrorCode.None);
        Assert.IsTrue(actual.HasRenderings);
    }

    [Test]
    public async Task GetBiblicalTermsAsync_MissingBiblicalTermsParatextProject()
    {
        // Setup the test environment
        var env = new TestEnvironment();
        SFProject project = env.NewSFProject();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        env.SetupProject(env.Project02, new SFParatextUser(env.Username01));

        // Setup Biblical Terms
        string settingValue = $"Project:{project.ShortName}:ProjectBiblicalTerms.xml";
        env.ProjectScrText.Settings.SetSetting(Setting.BiblicalTermsListSetting, settingValue);

        // SUT
        BiblicalTermsChanges actual = await env.Service.GetBiblicalTermsAsync(
            userSecret,
            env.PTProjectIds[env.Project02].Id,
            books: []
        );
        Assert.IsNotEmpty(actual.ErrorMessage);
        Assert.AreEqual(actual.ErrorCode, BiblicalTermErrorCode.NoPermission);
    }

    [Test]
    public async Task GetBiblicalTermsAsync_MissingBiblicalTermsProject()
    {
        // Setup the test environment
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        env.SetupProject(env.Project01, new SFParatextUser(env.Username01));

        // Setup Biblical Terms
        const string btShortName = "AnotherProjectShortName";
        const string settingValue = $"Project:{btShortName}:ProjectBiblicalTerms.xml";
        env.ProjectScrText.Settings.SetSetting(Setting.BiblicalTermsListSetting, settingValue);

        // SUT
        BiblicalTermsChanges actual = await env.Service.GetBiblicalTermsAsync(
            userSecret,
            env.PTProjectIds[env.Project01].Id,
            books: []
        );
        Assert.IsNotEmpty(actual.ErrorMessage);
        Assert.AreEqual(actual.ErrorCode, BiblicalTermErrorCode.NotSynced);
    }

    [Test]
    public async Task GetBiblicalTermsAsync_MissingParatextProject()
    {
        // Setup the test environment
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);

        // SUT
        BiblicalTermsChanges actual = await env.Service.GetBiblicalTermsAsync(
            userSecret,
            env.PTProjectIds[env.Project01].Id,
            books: []
        );
        Assert.IsNotEmpty(actual.ErrorMessage);
        Assert.AreEqual(actual.ErrorCode, BiblicalTermErrorCode.NotAccessible);
    }

    [Test]
    public async Task GetBiblicalTermsAsync_NoTermRenderings()
    {
        // Setup the test environment
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        env.SetupProject(env.Project01, new SFParatextUser(env.Username01));

        // SUT
        BiblicalTermsChanges actual = await env.Service.GetBiblicalTermsAsync(
            userSecret,
            env.PTProjectIds[env.Project01].Id,
            books: [40]
        );

        // There are 580 Major Biblical Terms in Matthew
        Assert.AreEqual(actual.BiblicalTerms.Count, 580);
        Assert.IsEmpty(actual.ErrorMessage);
        Assert.AreEqual(actual.ErrorCode, BiblicalTermErrorCode.None);
        Assert.IsFalse(actual.HasRenderings);
    }

    [Test]
    public async Task GetBiblicalTermsAsync_ProjectBiblicalTerms()
    {
        // Setup the test environment
        var env = new TestEnvironment();
        SFProject project = env.NewSFProject();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        env.SetupProject(env.Project01, new SFParatextUser(env.Username01));

        // Setup Biblical Terms
        string settingValue = $"Project:{project.ShortName}:ProjectBiblicalTerms.xml";
        env.ProjectScrText.Settings.SetSetting(Setting.BiblicalTermsListSetting, settingValue);
        Term term = new Term
        {
            CategoryIds = ["AT"],
            Id = "my_term_id",
            Index = 0,
            Language = "greek",
            LinkString = "my_links",
            LocalGloss = "my_gloss",
            References = [new Verse { VerseText = new VerseRef(40, 1, 1).BBBCCCVVVS }],
            SemanticDomain = "animals",
            Transliteration = "my_transliteration",
        };
        TermRendering termRendering = new TermRendering
        {
            Id = term.Id,
            RenderingsInternal = "my_rendering",
            Notes = "my_notes",
        };
        BiblicalTermsList biblicalTermsList = new BiblicalTermsList();
        biblicalTermsList.AddTerm(term);
        env.ProjectFileManager.GetXml<BiblicalTermsList>(Arg.Any<string>()).Returns(biblicalTermsList);

        env.ProjectFileManager.GetXml<TermRenderingsList>(Arg.Any<string>())
            .Returns(new TermRenderingsList { RenderingsInternal = [termRendering] });

        // SUT
        BiblicalTermsChanges actual = await env.Service.GetBiblicalTermsAsync(
            userSecret,
            env.PTProjectIds[env.Project01].Id,
            books: [40]
        );

        Assert.IsEmpty(actual.BiblicalTerms.Single().DataId);
        Assert.AreEqual(actual.BiblicalTerms.Single().Definitions["en"].Categories.Single(), "Attributes");
        Assert.AreEqual(actual.BiblicalTerms.Single().Definitions["en"].Domains.Single(), term.SemanticDomain);
        Assert.AreEqual(actual.BiblicalTerms.Single().Definitions["en"].Gloss, term.Gloss);
        Assert.AreEqual(actual.BiblicalTerms.Single().Description, termRendering.Notes);
        Assert.AreEqual(actual.BiblicalTerms.Single().Transliteration, term.Transliteration);
        Assert.AreEqual(actual.BiblicalTerms.Single().Language, term.Language);
        Assert.AreEqual(actual.BiblicalTerms.Single().Links.Single(), term.Links.Single());
        Assert.AreEqual(actual.BiblicalTerms.Single().TermId, term.Id);
        Assert.AreEqual(actual.BiblicalTerms.Single().References.Single(), term.References.Single().VerseRef.BBBCCCVVV);
        Assert.AreEqual(actual.BiblicalTerms.Single().Renderings.Single(), termRendering.RenderingsEntries.Single());
        Assert.IsEmpty(actual.ErrorMessage);
        Assert.AreEqual(actual.ErrorCode, BiblicalTermErrorCode.None);
        Assert.IsTrue(actual.HasRenderings);
    }

    [Test]
    public void UpdateBiblicalTerms_MissingParatextProject()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        IReadOnlyList<BiblicalTerm> biblicalTerms = [new BiblicalTerm()];

        // SUT
        env.Service.UpdateBiblicalTerms(userSecret, env.PTProjectIds[env.Project01].Id, biblicalTerms);
        env.MockScrTextCollection.Received(1).FindById(Arg.Any<string>(), Arg.Any<string>());
    }

    [Test]
    public void UpdateBiblicalTerms_NoBiblicalTerms()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        IReadOnlyList<BiblicalTerm> biblicalTerms = [];

        // SUT
        env.Service.UpdateBiblicalTerms(userSecret, env.PTProjectIds[env.Project01].Id, biblicalTerms);
        env.MockScrTextCollection.DidNotReceive().FindById(Arg.Any<string>(), Arg.Any<string>());
    }

    [Test]
    public void UpdateBiblicalTerms_UpdatesTermRenderings()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        env.SetupProject(env.Project01, new SFParatextUser(env.Username01));

        // Setup term rendering
        const string termId = "Ἀβιά-1";
        env.ProjectFileManager.GetXml<TermRenderingsList>(Arg.Any<string>())
            .Returns(
                new TermRenderingsList
                {
                    RenderingsInternal =
                    [
                        new TermRendering
                        {
                            Id = termId,
                            RenderingsInternal = "Old Abijah",
                            Notes = "Old Notes",
                        },
                    ],
                }
            );

        const string newRendering = "New Abijah";
        const string newNotes = "New Notes";
        IReadOnlyList<BiblicalTerm> biblicalTerms =
        [
            new BiblicalTerm
            {
                TermId = termId,
                Renderings = [newRendering],
                Description = newNotes,
            },
        ];

        // SUT
        env.Service.UpdateBiblicalTerms(userSecret, env.PTProjectIds[env.Project01].Id, biblicalTerms);
        env.ProjectFileManager.Received(1)
            .SetXml(
                Arg.Is<TermRenderingsList>(r =>
                    r.Renderings.Single().Id == termId
                    && r.Renderings.Single().RenderingsEntries.Single() == newRendering
                    && r.Renderings.Single().Notes == newNotes
                ),
                "TermRenderings.xml"
            );
    }

    [Test]
    public void InitializeCommentManager_MissingParatextProject()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        env.ProjectFileManager = Substitute.For<ProjectFileManager>(null, null);

        // SUT
        env.Service.InitializeCommentManager(userSecret, env.PTProjectIds[env.Project01].Id);
        env.ProjectFileManager.DidNotReceive().ProjectFiles("Notes_*.xml");
        env.ProjectFileManager.DidNotReceive().GetXml<CommentList>(Arg.Any<string>());
    }

    [Test]
    public void InitializeCommentManager_Success()
    {
        var env = new TestEnvironment();
        env.SetupProject(env.Project01, new SFParatextUser(env.Username01));
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        const string fileName = "Notes_User 01.xml";
        env.ProjectFileManager.ProjectFiles("Notes_*.xml").Returns([fileName]);

        // SUT
        env.Service.InitializeCommentManager(userSecret, env.PTProjectIds[env.Project01].Id);
        env.ProjectFileManager.Received().ProjectFiles("Notes_*.xml");
        env.ProjectFileManager.Received().GetXml<CommentList>(Arg.Any<string>());
    }

    [Test]
    public void GetParatextUsername_ForcedUsername()
    {
        var env = new TestEnvironment();
        UserSecret userSecret = TestEnvironment.MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
        string username = env.Service.GetParatextUsername(userSecret);
        Assert.AreEqual(env.Username01, username);

        string forcedUsername = "Forced Username";
        env.Service.ForceParatextUsername(env.Username01, forcedUsername);

        username = env.Service.GetParatextUsername(userSecret);
        Assert.AreEqual(forcedUsername, username);
        env.Service.ClearForcedUsernames();
    }

    private class TestEnvironment : IDisposable
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
        public readonly Dictionary<string, HexId> PTProjectIds = [];
        public readonly string User01 = "user01";
        public readonly string User02 = "user02";
        public readonly string User03 = "user03";

        // User04 and User05 are SF users and is not a PT users.
        public readonly string User04 = "user04";
        public readonly string User05 = "user05";
        public readonly string Username01 = "User 01";
        public readonly string Username02 = "User 02";
        public readonly string Username03 = "User 03";
        public readonly string SyncDir = Path.GetTempPath();
        public readonly string ContextBefore = "Context before ";
        public readonly string ContextAfter = " context after.";
        public readonly string AlternateBefore = "Alternate before ";
        public readonly string AlternateAfter = " alternate after.";
        public readonly string ReattachedSelectedText = "reattached text";
        public readonly int TagCount = 10;

        public readonly string RuthBookUsfm =
            "\\id RUT - ProjectNameHere\r\n\\c 1\r\n\\v 1 Verse 1 here.\r\n\\v 2 Verse 2 here.\r\n";
        private const string _ruthBookUsxString =
            "<usx version=\"3.0\">\r\n  <book code=\"RUT\" style=\"id\">- ProjectNameHere"
            + "</book>\r\n  <chapter number=\"1\" style=\"c\" />\r\n  <verse number=\"1\" style=\"v\" />"
            + "Verse 1 here. <verse number=\"2\" style=\"v\" />Verse 2 here.</usx>";
        public readonly string RuthBookUsxString = _ruthBookUsxString;
        public readonly XDocument RuthBookUsx = XDocument.Parse(_ruthBookUsxString);

        public readonly Usj RuthBookUsj = new Usj
        {
            Type = Usj.UsjType,
            Version = Usj.UsjVersion,
            Content =
            [
                new UsjMarker
                {
                    Marker = "id",
                    Code = "RUT",
                    Type = "book",
                    Content = ["- ProjectNameHere"],
                },
                new UsjMarker
                {
                    Marker = "c",
                    Number = "1",
                    Type = "chapter",
                },
                new UsjMarker
                {
                    Marker = "v",
                    Number = "1",
                    Type = "verse",
                },
                "Verse 1 here. ",
                new UsjMarker
                {
                    Marker = "v",
                    Number = "2",
                    Type = "verse",
                },
                "Verse 2 here.",
            ],
        };

        public readonly HttpResponseMessage UnauthorizedHttpResponseMessage = new HttpResponseMessage(
            HttpStatusCode.Unauthorized
        )
        {
            RequestMessage = new HttpRequestMessage(HttpMethod.Get, "some-request-uri"),
            Content = new ByteArrayContent(Encoding.UTF8.GetBytes("big problem")),
        };

        public readonly HttpResponseMessage NotFoundHttpResponseMessage = new HttpResponseMessage(
            HttpStatusCode.NotFound
        )
        {
            RequestMessage = new HttpRequestMessage(HttpMethod.Get, "some-request-uri"),
            Content = new ByteArrayContent(Encoding.UTF8.GetBytes("we looked everywhere")),
        };

        public readonly IWebHostEnvironment MockWebHostEnvironment;
        public readonly IOptions<ParatextOptions> MockParatextOptions;
        public readonly IRepository<UserSecret> MockRepository;
        public readonly SFMemoryRealtimeService RealtimeService;
        public readonly IExceptionHandler MockExceptionHandler;
        public readonly IOptions<SiteOptions> MockSiteOptions;
        public readonly IFileSystemService MockFileSystemService;
        public readonly IScrTextCollection MockScrTextCollection;
        public readonly ISharingLogicWrapper MockSharingLogicWrapper;
        public readonly IHgWrapper MockHgWrapper;
        public readonly MockLogger<ParatextService> MockLogger;
        public readonly IJwtTokenHelper MockJwtTokenHelper;
        public readonly IParatextDataHelper MockParatextDataHelper;
        public readonly IInternetSharedRepositorySourceProvider MockInternetSharedRepositorySourceProvider;
        public readonly ISFRestClientFactory MockRestClientFactory;
        public readonly IGuidService MockGuidService;
        public readonly ParatextService Service;
        public readonly HttpClient MockRegistryHttpClient;
        public readonly IDeltaUsxMapper MockDeltaUsxMapper;
        public readonly IAuthService MockAuthService;
        public readonly Dictionary<string, string> usernames;
        private bool disposed;

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
            MockGuidService = Substitute.For<IGuidService>();
            MockRegistryHttpClient = Substitute.For<HttpClient>();
            MockDeltaUsxMapper = Substitute.For<IDeltaUsxMapper>();
            MockAuthService = Substitute.For<IAuthService>();

            DateTime aSecondAgo = DateTime.Now - TimeSpan.FromSeconds(1);
            string accessToken1 = TokenHelper.CreateAccessToken(
                aSecondAgo - TimeSpan.FromMinutes(20),
                aSecondAgo,
                ParatextUserId01
            );
            string accessToken2 = TokenHelper.CreateAccessToken(
                aSecondAgo - TimeSpan.FromMinutes(20),
                aSecondAgo,
                ParatextUserId02
            );
            string accessToken3 = TokenHelper.CreateAccessToken(
                aSecondAgo - TimeSpan.FromMinutes(20),
                aSecondAgo,
                ParatextUserId03
            );
            MockRepository = new MemoryRepository<UserSecret>(
                new[]
                {
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
                }
            );

            RealtimeService = new SFMemoryRealtimeService();

            MockSiteOptions.Value.Returns(new SiteOptions { Name = "xForge" });

            int guidServiceCharId = 1;
            MockGuidService.Generate().Returns(_ => $"{guidServiceCharId++}");
            string guidServiceGuidPrefix = "syncuser0";
            int guidServiceObjectId = 2;
            MockGuidService.NewObjectId().Returns(_ => guidServiceGuidPrefix + guidServiceObjectId++);
            usernames = new Dictionary<string, string>
            {
                { User01, "User 01 Display" },
                { User02, Username02 },
                { User05, "User 05" },
            };

            Service = new ParatextService(
                MockWebHostEnvironment,
                MockParatextOptions,
                MockRepository,
                RealtimeService,
                MockExceptionHandler,
                MockSiteOptions,
                MockFileSystemService,
                MockLogger,
                MockJwtTokenHelper,
                MockParatextDataHelper,
                MockInternetSharedRepositorySourceProvider,
                MockGuidService,
                MockRestClientFactory,
                MockHgWrapper,
                MockDeltaUsxMapper,
                MockAuthService
            )
            {
                ScrTextCollection = MockScrTextCollection,
                SharingLogicWrapper = MockSharingLogicWrapper,
                SyncDir = SyncDir,
                _registryClient = MockRegistryHttpClient,
            };

            PTProjectIds.Add(Project01, HexId.CreateNew());
            PTProjectIds.Add(Project02, HexId.CreateNew());
            PTProjectIds.Add(Project03, HexId.CreateNew());
            PTProjectIds.Add(Project04, HexId.CreateNew());

            MockJwtTokenHelper
                .GetParatextUsername(Arg.Is<UserSecret>(u => u != null && u.Id == User01))
                .Returns(Username01);
            MockJwtTokenHelper
                .GetParatextUsername(Arg.Is<UserSecret>(u => u != null && u.Id == User02))
                .Returns(Username02);
            MockJwtTokenHelper
                .GetParatextUsername(Arg.Is<UserSecret>(u => u != null && u.Id == User03))
                .Returns(Username03);
            MockJwtTokenHelper.GetJwtTokenFromUserSecret(Arg.Any<UserSecret>()).Returns(accessToken1);
            MockJwtTokenHelper
                .RefreshAccessTokenAsync(
                    Arg.Any<ParatextOptions>(),
                    Arg.Any<Tokens>(),
                    Arg.Any<HttpClient>(),
                    Arg.Any<CancellationToken>()
                )
                .Returns(
                    Task.FromResult(new Tokens { AccessToken = accessToken1, RefreshToken = "refresh_token_1234" })
                );
            MockFileSystemService.DirectoryExists(SyncDir).Returns(true);
            MockSharingLogicWrapper
                .SearchForBestProjectUsersData(Arg.Any<SharedRepositorySource>(), Arg.Any<SharedProject>())
                .Returns(args => args.ArgAt<SharedProject>(1).Permissions);
            RegistryU.Implementation = new DotNetCoreRegistry();
            ScrTextCollection.Implementation = ProjectScrTextCollection;
            AddProjectRepository();
            AddUserRepository();

            // Ensure that the SLDR is initialized for LanguageID.Code to be retrieved correctly
            if (!Sldr.IsInitialized)
                Sldr.Initialize(true);

            // Setup Mercurial for tests
            Hg.DefaultRunnerCreationFunc = (_, _, _) => ProjectHgRunner;
            Hg.Default = ProjectHg;
        }

        public MockHgRunner ProjectHgRunner { get; } = new MockHgRunner();
        public MockHg ProjectHg { get; } = new MockHg();
        public SFScrTextCollection ProjectScrTextCollection { get; } = new SFScrTextCollection();
        public MockScrText ProjectScrText { get; set; }
        public CommentManager ProjectCommentManager { get; set; }
        public ProjectFileManager ProjectFileManager { get; set; }

        public ParatextProjectUser ParatextProjectUser01 =>
            new ParatextProjectUser
            {
                Id = User01,
                ParatextId = ParatextUserId01,
                Role = SFProjectRole.Administrator,
                Username = Username01,
            };

        public ParatextProjectUser ParatextProjectUser02 =>
            new ParatextProjectUser
            {
                Id = User02,
                ParatextId = ParatextUserId02,
                Role = SFProjectRole.Administrator,
                Username = Username02,
            };

        public static HttpResponseMessage MakeOkHttpResponseMessage(string content) =>
            new HttpResponseMessage(HttpStatusCode.OK)
            {
                RequestMessage = new HttpRequestMessage(HttpMethod.Get, "some-request-uri"),
                Content = new ByteArrayContent(Encoding.UTF8.GetBytes(content)),
            };

        public static UserSecret MakeUserSecret(string userSecretId, string username, string paratextUserId)
        {
            DateTime aSecondAgo = DateTime.Now - TimeSpan.FromSeconds(1);
            string accessToken = TokenHelper.CreateAccessToken(
                aSecondAgo - TimeSpan.FromMinutes(20),
                aSecondAgo,
                paratextUserId
            );
            UserSecret userSecret = new UserSecret
            {
                Id = userSecretId,
                ParatextTokens = new Tokens { AccessToken = accessToken, RefreshToken = "refresh_token_1234" },
            };
            return userSecret;
        }

        public ISFRestClientFactory SetRestClientFactory(UserSecret userSecret)
        {
            ISFRestClient mockClient = Substitute.For<ISFRestClient>();
            string json =
                @"{
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
            ""id"": """
                + this.Resource1Id
                + @""",
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
            ""id"": """
                + this.Resource2Id
                + @""",
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
            ""id"": """
                + this.Resource3Id
                + @""",
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
            mockClient.Get(Arg.Any<string>()).Returns(json);
            mockClient.GetFile(Arg.Any<string>(), Arg.Any<string>()).Returns(true);
            MockRestClientFactory
                .Create(Arg.Any<string>(), Arg.Is<UserSecret>(s => s.Id == userSecret.Id))
                .Returns(mockClient);
            return MockRestClientFactory;
        }

        /// <summary>
        /// If extraSharedRepository, a SharedRepository will be made that does not have corresponding
        /// ProjectMetadata.
        /// </summary>
        public IInternetSharedRepositorySource SetSharedRepositorySource(
            UserSecret userSecret,
            UserRoles userRoleOnAllThePtProjects,
            bool extraSharedRepository = false,
            string? paratextId = null
        )
        {
            // Set up the XML for the user roles - we could use an XML Document, but this is simpler
            // The schema is from ParatextData.InternalProjectUserAccessData
            // As the logic in PermissionManager is self-contained, this is better than a substitute
            string xml =
                "<ProjectUserAccess PeerSharing=\"true\">"
                + $"<User UserName=\"{Username01}\" FirstUser=\"true\" UnregisteredUser=\"false\">"
                + $"<Role>{userRoleOnAllThePtProjects}</Role><AllBooks>true</AllBooks>"
                + "<Books /><Permissions /><AutomaticBooks /><AutomaticPermissions />"
                + "</User>"
                + $"<User UserName=\"{Username02}\" FirstUser=\"false\" UnregisteredUser=\"false\">"
                + $"<Role>{userRoleOnAllThePtProjects}</Role><AllBooks>true</AllBooks>"
                + "<Books /><Permissions /><AutomaticBooks /><AutomaticPermissions />"
                + "</User>"
                + $"<User UserName=\"{Username03}\" FirstUser=\"false\" UnregisteredUser=\"false\">"
                + $"<Role>{userRoleOnAllThePtProjects}</Role><AllBooks>true</AllBooks>"
                + "<Books /><Permissions /><AutomaticBooks /><AutomaticPermissions />"
                + "</User>"
                + "</ProjectUserAccess>";
            PermissionManager sourceUsers = new PermissionManager(xml);
            IInternetSharedRepositorySource mockSource = Substitute.For<IInternetSharedRepositorySource>();
            SharedRepository repo1 = new SharedRepository
            {
                SendReceiveId = PTProjectIds[Project01],
                ScrTextName = "P01",
                SourceUsers = sourceUsers,
            };
            SharedRepository repo2 = new SharedRepository
            {
                SendReceiveId = PTProjectIds[Project02],
                ScrTextName = "P02",
                SourceUsers = sourceUsers,
            };
            SharedRepository repo3 = new SharedRepository
            {
                SendReceiveId = PTProjectIds[Project03],
                ScrTextName = "P03",
                SourceUsers = sourceUsers,
            };
            SharedRepository repo4 = new SharedRepository
            {
                SendReceiveId = PTProjectIds[Project04],
                ScrTextName = "P04",
                SourceUsers = sourceUsers,
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

            // Set up the individual metadata and license calls if we are to configure it
            if (paratextId is not null)
            {
                JObject projectLicense = JObject.Parse(
                    $$"""
                    {
                      "type": "translator",
                      "licensedToParatextId": "{{paratextId}}",
                      "licensedToOrgs": [
                        "5494956f5117ad586f2e2f40"
                      ],
                      "issuedAt": "2024-06-18T22:26:28.854Z",
                      "expiresAt": "2024-06-18T22:26:28.854Z",
                      "revoked": true
                    }
                    """
                );
                mockSource.GetLicenseForUserProject(paratextId).Returns(new ProjectLicense(projectLicense));
                if (paratextId == PTProjectIds[Project01].Id)
                {
                    mockSource.GetProjectMetadata(paratextId).Returns(projMeta1);
                }
                else if (paratextId == PTProjectIds[Project02].Id)
                {
                    mockSource.GetProjectMetadata(paratextId).Returns(projMeta2);
                }
                else if (paratextId == PTProjectIds[Project03].Id)
                {
                    mockSource.GetProjectMetadata(paratextId).Returns(projMeta3);
                }
            }

            // An HttpException means that the repo is already unlocked, so any code should be OK with this
            mockSource
                .When(s => s.UnlockRemoteRepository(Arg.Any<SharedRepository>()))
                .Do(x =>
                    throw HttpException.Create(new WebException(), GenericRequest.Create(new Uri("http://localhost/")))
                );
            MockInternetSharedRepositorySourceProvider
                .GetSource(Arg.Is<UserSecret>(s => s.Id == userSecret.Id), Arg.Any<string>(), Arg.Any<string>())
                .Returns(mockSource);

            return mockSource;
        }

        public SFProject NewSFProject(string? projectId = null)
        {
            projectId ??= Project01;
            return new SFProject
            {
                Id = "sf_id_" + projectId,
                ParatextId = PTProjectIds[projectId].Id,
                Name = "Full Name " + Project01,
                ShortName = "P01",
                WritingSystem = new WritingSystem { Tag = "en" },
                TranslateConfig = new TranslateConfig
                {
                    TranslationSuggestionsEnabled = true,
                    Source = new TranslateSource
                    {
                        ParatextId = "paratextId",
                        Name = "Source",
                        ShortName = "SRC",
                        WritingSystem = new WritingSystem { Tag = "qaa" },
                    },
                },
                CheckingConfig = new CheckingConfig(),
                UserRoles = new Dictionary<string, string>
                {
                    { User01, SFProjectRole.Administrator },
                    { User02, SFProjectRole.CommunityChecker },
                    { User05, SFProjectRole.Commenter },
                },
                Texts =
                {
                    new TextInfo
                    {
                        BookNum = 40,
                        Chapters =
                        {
                            new Chapter
                            {
                                Number = 1,
                                LastVerse = 6,
                                IsValid = true,
                                Permissions = [],
                            },
                        },
                    },
                    new TextInfo
                    {
                        BookNum = 41,
                        Chapters =
                        {
                            new Chapter
                            {
                                Number = 1,
                                LastVerse = 3,
                                IsValid = true,
                                Permissions = [],
                            },
                            new Chapter
                            {
                                Number = 2,
                                LastVerse = 3,
                                IsValid = true,
                                Permissions = [],
                            },
                        },
                    },
                },
            };
        }

        public void AddTextDataOps(string projectId, string book, int chapter)
        {
            // Using the last hour will ensure that that ops are combined
            // consistently in ParatextService.GetRevisionHistoryAsync()
            DateTime thePreviousHour = new DateTime(
                DateTime.UtcNow.Year,
                DateTime.UtcNow.Month,
                DateTime.UtcNow.Day,
                DateTime.UtcNow.Hour,
                0,
                0,
                DateTimeKind.Utc
            );
            Op[] ops =
            [
                new Op
                {
                    Metadata = new OpMetadata { Timestamp = thePreviousHour.AddMinutes(-30) },
                    Version = 1,
                },
                new Op
                {
                    Metadata = new OpMetadata { Timestamp = thePreviousHour.AddMinutes(-10) },
                    Version = 2,
                },
                new Op
                {
                    // This op should be combined with the next
                    Metadata = new OpMetadata { Timestamp = thePreviousHour.AddMinutes(-1) },
                    Version = 3,
                },
                new Op
                {
                    Metadata = new OpMetadata
                    {
                        Timestamp = thePreviousHour,
                        UserId = "user01",
                        Source = OpSource.Draft,
                    },
                    Version = 4,
                },
            ];
            string id = TextData.GetTextDocId(projectId, book, chapter);
            RealtimeService.AddRepository("texts", OTType.RichText, new MemoryRepository<TextData>());
            RealtimeService.GetRepository<TextData>().SetOps(id, ops);
        }

        public void AddProjectRepository(SFProject proj = null)
        {
            proj ??= NewSFProject();
            AddProjectRepository([proj]);
        }

        public void AddProjectRepository(SFProject[] projects)
        {
            RealtimeService.AddRepository("sf_projects", OTType.Json0, new MemoryRepository<SFProject>(projects));
            MockFileSystemService
                .DirectoryExists(
                    Arg.Is<string>((string path) => path.EndsWith(Path.Join(PTProjectIds[Project01].Id, "target")))
                )
                .Returns(true);
        }

        public void AddUserRepository(User[]? users = null) =>
            RealtimeService.AddRepository(
                "users",
                OTType.Json0,
                new MemoryRepository<User>(
                    users
                        ??
                        [
                            new User { Id = User01, ParatextId = ParatextUserId01 },
                            new User { Id = User02, ParatextId = ParatextUserId02 },
                            new User { Id = User03, ParatextId = ParatextUserId03 },
                            new User { Id = User04 },
                            new User { Id = User05 },
                        ]
                )
            );

        public void AddTextDocs(
            int bookNum,
            int chapterNum,
            int verses,
            string contextBefore,
            string selectedText,
            bool useThreadSuffix = true
        )
        {
            Delta chapterDelta = GetChapterDelta(
                chapterNum,
                verses,
                contextBefore,
                selectedText,
                useThreadSuffix,
                false
            );
            var texts = new TextData[]
            {
                new TextData(chapterDelta) { Id = TextData.GetTextDocId("sf_id_" + Project01, bookNum, chapterNum) },
            };
            RealtimeService.AddRepository("texts", OTType.RichText, new MemoryRepository<TextData>(texts));
        }

        public TextData AddTextDoc(int bookNum, int chapterNum)
        {
            TextData textDoc = GetTextDoc(bookNum, chapterNum);
            RealtimeService.AddRepository("texts", OTType.RichText, new MemoryRepository<TextData>([textDoc]));
            return textDoc;
        }

        public TextData GetTextDoc(int bookNum, int chapterNum) =>
            new TextData(Delta.New().Insert("In the beginning"))
            {
                Id = TextData.GetTextDocId("sf_id_" + Project01, bookNum, chapterNum),
            };

        public void AddNoteThreadData(ThreadComponents[] threadComponents)
        {
            IEnumerable<NoteThread> threads = Array.Empty<NoteThread>();
            foreach (var comp in threadComponents)
            {
                string threadId = "thread" + comp.threadNum;
                string dataId = "dataId" + comp.threadNum;
                string text = "Text selected " + threadId;
                string selectedText = comp.appliesToVerse ? ContextBefore + text + ContextAfter : text;

                var noteThread = new NoteThread
                {
                    Id = "project01:" + dataId,
                    DataId = dataId,
                    ThreadId = threadId,
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
                    Assignment = GetAssignedUserStr(comp.notes),
                };
                List<Note> notes = [];
                for (int i = 1; i <= comp.noteCount; i++)
                {
                    ThreadNoteComponents noteComponent = new ThreadNoteComponents
                    {
                        status = NoteStatus.Todo,
                        tagsAdded = [CommentTag.toDoTagId.ToString()],
                        assignedPTUser = CommentThread.unassignedUser,
                    };
                    if (comp.notes != null)
                        noteComponent = comp.notes[i - 1];
                    noteComponent.ownerRef ??= User05;
                    if (!noteComponent.forceNullContent)
                    {
                        noteComponent.content ??= comp.isEdited
                            ? $"{threadId} note {i}: EDITED."
                            : $"{threadId} note {i}.";
                    }
                    Note note = new Note
                    {
                        DataId = $"n{i}on{threadId}",
                        ThreadId = threadId,
                        Type = NoteType.Normal.InternalValue,
                        ConflictType = Note.NoConflictType,
                        OwnerRef = noteComponent.ownerRef,
                        Content = noteComponent.content,
                        SyncUserRef = comp.isNew ? null : noteComponent.syncUserRef ?? "syncuser01",
                        DateCreated = new DateTime(2019, 1, i, 8, 0, 0, DateTimeKind.Utc),
                        TagId = noteComponent.tagsAdded == null ? null : int.Parse(noteComponent.tagsAdded[0]),
                        Deleted = comp.deletedNotes != null && comp.deletedNotes[i - 1],
                        Status = noteComponent.status.InternalValue,
                        Assignment = noteComponent.assignedPTUser,
                        Editable = noteComponent.editable ?? comp.editable,
                        VersionNumber = noteComponent.versionNumber ?? comp.versionNumber,
                    };
                    notes.Add(note);
                    if (noteComponent.duplicate)
                        notes.Add(note);
                }
                if (comp.reattachedVerseStr != null)
                {
                    ReattachedThreadInfo rti = default;
                    string reattached;
                    if (comp.doNotParseReattachedVerseStr)
                    {
                        reattached = comp.reattachedVerseStr;
                    }
                    else
                    {
                        rti = GetReattachedThreadInfo(comp.reattachedVerseStr);
                        reattached = ReattachedThreadInfoStr(rti);
                    }

                    notes.Add(
                        new Note
                        {
                            DataId = $"reattached{threadId}",
                            ThreadId = threadId,
                            Type = NoteType.Normal.InternalValue,
                            ConflictType = Note.NoConflictType,
                            OwnerRef = "user02",
                            SyncUserRef = "syncuser01",
                            DateCreated = new DateTime(2019, 1, 20, 8, 0, 0, DateTimeKind.Utc),
                            Status = NoteStatus.Unspecified.InternalValue,
                            Reattached = reattached,
                        }
                    );
                    if (rti is not null)
                    {
                        noteThread.Position = new TextAnchor
                        {
                            Start = rti.contextBefore.Length,
                            Length = rti.selectedText.Length,
                        };
                    }
                }
                noteThread.Notes = notes;
                if (notes.Count > 0)
                    threads = threads.Append(noteThread);
            }
            RealtimeService.AddRepository("note_threads", OTType.Json0, new MemoryRepository<NoteThread>(threads));
        }

        public void AddThread(NoteThread thread)
        {
            var threads = new NoteThread[1];
            threads[0] = thread;
            RealtimeService.AddRepository("note_threads", OTType.Json0, new MemoryRepository<NoteThread>(threads));
        }

        public Dictionary<int, ChapterDelta> GetChapterDeltasByBook(
            int chapters,
            string contextBefore,
            string selectedText,
            bool useThreadSuffix = true,
            bool includeRelatedVerse = false
        )
        {
            Dictionary<int, ChapterDelta> chapterDeltas = [];
            const int numVersesInChapter = 10;
            for (int i = 1; i <= chapters; i++)
            {
                Delta delta = GetChapterDelta(
                    i,
                    numVersesInChapter,
                    contextBefore,
                    selectedText,
                    useThreadSuffix,
                    includeRelatedVerse
                );
                chapterDeltas.Add(i, new ChapterDelta(i, numVersesInChapter, true, delta));
            }
            return chapterDeltas;
        }

        public static XElement GetUpdateNotesXml(
            string threadId,
            string user,
            DateTime date,
            string content,
            string verseRef = "MAT 1:1",
            bool delete = false
        )
        {
            XElement notesElem = new XElement("notes", new XAttribute("version", "1.1"));
            XElement threadElem = new XElement(
                "thread",
                new XAttribute("id", threadId),
                new XElement(
                    "selection",
                    new XAttribute("verseRef", verseRef),
                    new XAttribute("startPos", 0),
                    new XAttribute("selectedText", "")
                )
            );
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
            return notesElem;
        }

        public static async Task<IEnumerable<IDocument<NoteThread>>> GetNoteThreadDocsAsync(
            IConnection connection,
            string[] dataIds
        )
        {
            List<IDocument<NoteThread>> noteThreadDocs = [];
            foreach (string dataId in dataIds)
                noteThreadDocs.Add(await GetNoteThreadDocAsync(connection, dataId));
            return noteThreadDocs;
        }

        public static async Task<IDocument<NoteThread>> GetNoteThreadDocAsync(IConnection connection, string dataId) =>
            await connection.FetchAsync<NoteThread>("project01:" + dataId);

        public static async Task<Stream> CreateZipStubAsync()
        {
            var outputMemStream = new MemoryStream();
            await using (var zipStream = new ZipOutputStream(outputMemStream))
            {
                ZipEntry newEntry = new ZipEntry("test.txt");
                await zipStream.PutNextEntryAsync(newEntry);
                await zipStream.CloseEntryAsync(CancellationToken.None);

                // Stop ZipStream.Dispose() from also closing the underlying stream.
                zipStream.IsStreamOwner = false;
            }

            outputMemStream.Position = 0;
            return outputMemStream;
        }

        public string SetupProject(string baseId, ParatextUser associatedPtUser, bool hasEditPermission = true)
        {
            string ptProjectId = PTProjectIds[baseId].Id;
            ProjectScrText = GetScrText(associatedPtUser, ptProjectId, hasEditPermission);
            ProjectScrTextCollection.AddToInternalIndex(ProjectScrText);

            // We set the file manager here so we can track file manager operations after
            // the ScrText object has been disposed in ParatextService.
            ProjectFileManager = Substitute.For<ProjectFileManager>(ProjectScrText, null);
            ProjectFileManager.IsWritable.Returns(true);
            ProjectScrText.SetFileManager(ProjectFileManager);
            ProjectCommentManager = CommentManager.Get(ProjectScrText);
            MockScrTextCollection.FindById(Arg.Any<string>(), ptProjectId).Returns(ProjectScrText);
            SetupCommentTags(ProjectScrText, null);
            return ptProjectId;
        }

        public void AddParatextComments(ThreadComponents[] components)
        {
            XmlDocument doc = new XmlDocument();
            foreach (ThreadComponents comp in components)
            {
                string threadId = "thread" + comp.threadNum;
                var associatedPtUser = new SFParatextUser(comp.username ?? "");
                string before = ContextBefore;
                string after = ContextAfter;
                string text = "Text selected " + threadId;
                string selectedText = comp.appliesToVerse ? ContextBefore + text + ContextAfter : text;
                string verseStr = $"MAT 1:{comp.threadNum}";
                string sectionHeading = "Section heading text";

                switch (comp.alternateText)
                {
                    case SelectionType.RelatedVerse:
                        // The alternate text is in a subsequent paragraph with a footnote represented by '*'
                        before = before + text + after + "\n*";
                        after = "";
                        selectedText = "other text in verse";
                        break;
                    case SelectionType.Section:
                        before = before + text + after;
                        after = "";
                        selectedText = sectionHeading;
                        break;
                    case SelectionType.SectionEnd:
                        before = before + text + after + sectionHeading;
                        after = " \\p";
                        selectedText = "";
                        break;
                }

                Paratext.Data.ProjectComments.Comment getThreadComment()
                {
                    return new Paratext.Data.ProjectComments.Comment(associatedPtUser)
                    {
                        Thread = threadId,
                        VerseRefStr = verseStr,
                        SelectedText = selectedText,
                        ContextBefore = comp.appliesToVerse ? "" : before,
                        ContextAfter = comp.appliesToVerse ? "" : after,
                        StartPosition = comp.appliesToVerse ? 0 : before.Length,
                    };
                }

                for (int i = 1; i <= comp.noteCount; i++)
                {
                    string date = $"2019-01-0{i}T08:00:00.0000000+00:00";
                    Paratext.Data.ProjectComments.Comment comment = getThreadComment();

                    ThreadNoteComponents note = new ThreadNoteComponents
                    {
                        status = NoteStatus.Todo,
                        tagsAdded = [CommentTag.toDoTagId.ToString()],
                        assignedPTUser = CommentThread.unassignedUser,
                    };
                    if (comp.notes != null)
                        note = comp.notes[i - 1];
                    note.ownerRef ??= User05;
                    string content = note.ownerRef == User05 ? "<p sf-user-label=\"true\">[User 05 - xForge]</p>" : "";
                    string commentContent = comp.isEdited ? $"{threadId} note {i}: EDITED." : $"{threadId} note {i}.";
                    content += note.ownerRef == User05 ? $"<p>{commentContent}</p>" : commentContent;
                    if (!note.forceNullContent)
                        note.content ??= content;

                    XmlElement contentElem = doc.CreateElement("Contents");
                    contentElem.InnerXml = note.content;
                    comment.Contents = contentElem;
                    comment.Date = date;
                    comment.Deleted = comp.deletedNotes != null && comp.deletedNotes[i - 1];
                    comment.Status = note.status;
                    if (note.ownerRef != User01 && !comp.isConflict)
                        comment.ExternalUser = note.ownerRef;
                    comment.TagsAdded = comp.isConflict ? null : note.tagsAdded ?? null;
                    comment.Type = comp.isConflict ? NoteType.Conflict : NoteType.Normal;
                    comment.ConflictType = NoteConflictType.None;
                    comment.AssignedUser = note.assignedPTUser;
                    comment.VersionNumber = note.versionNumber ?? comp.versionNumber;
                    ProjectCommentManager.AddComment(comment);
                    if (note.duplicate)
                        ProjectCommentManager.AddComment(comment);
                }

                if (comp.reattachedVerseStr != null)
                {
                    Paratext.Data.ProjectComments.Comment reattachedComment = getThreadComment();
                    reattachedComment.Status = NoteStatus.Unspecified;
                    reattachedComment.Date = "2019-01-20T08:00:00.0000000+00:00";
                    if (comp.doNotParseReattachedVerseStr)
                    {
                        reattachedComment.Reattached = comp.reattachedVerseStr;
                    }
                    else
                    {
                        ReattachedThreadInfo rti = GetReattachedThreadInfo(comp.reattachedVerseStr);
                        reattachedComment.Reattached = ReattachedThreadInfoStr(rti);
                    }

                    ProjectCommentManager.AddComment(reattachedComment);
                }
            }
        }

        public void AddParatextComment(Paratext.Data.ProjectComments.Comment comment) =>
            ProjectCommentManager.AddComment(comment);

        public MockResourceScrText GetResourceScrText(
            ParatextUser associatedPtUser,
            string projectId,
            string shortName,
            string zipLanguageCode = "eng"
        )
        {
            string scrTextDir = Path.Join(SyncDir, $"{shortName}.p8z");
            ProjectName projectName = new ProjectName { ProjectPath = scrTextDir, ShortName = shortName };
            var scrText = new MockResourceScrText(
                projectName,
                associatedPtUser,
                new MockZippedResourcePasswordProvider()
            )
            {
                CachedGuid = HexId.FromStr(projectId),
            };
            scrText.Settings.LanguageID = LanguageId.English;
            scrText.ZipFile.AddFile(
                Path.Join(ZippedProjectFileManagerBase.DBLFolderName, "language", "iso", zipLanguageCode)
            );
            return scrText;
        }

        public MockScrText GetScrText(ParatextUser associatedPtUser, string projectId, bool hasEditPermission = true)
        {
            string scrTextDir = Path.Join(SyncDir, projectId, "target");
            ProjectName projectName = new ProjectName { ProjectPath = scrTextDir, ShortName = "Proj" };
            var scrText = new MockScrText(associatedPtUser, projectName) { CachedGuid = HexId.FromStr(projectId) };
            scrText.Permissions.CreateFirstAdminUser();
            scrText.Data.Add("RUT", RuthBookUsfm);
            scrText.Settings.BooksPresentSet = new BookSet("RUT");
            scrText.Settings.LanguageID = LanguageId.English;
            scrText.Settings.FileNamePostPart = ".SFM";
            if (!hasEditPermission)
                scrText.Permissions.SetPermission(null, 8, PermissionSet.Manual, false);
            return scrText;
        }

        public void SetupCommentTags(MockScrText scrText, NoteTag noteTag)
        {
            var tags = new List<CommentTag>();
            for (int tagId = 1; tagId <= TagCount; tagId++)
            {
                if (tagId < TagCount)
                {
                    if (noteTag != null && tagId == noteTag.TagId)
                    {
                        tags.Add(
                            new CommentTag(noteTag.Name, noteTag.Icon, tagId)
                            {
                                CreatorResolve = noteTag.CreatorResolve,
                            }
                        );
                    }
                    else
                    {
                        tags.Add(new CommentTag($"tag{tagId}", $"icon{tagId}", tagId) { CreatorResolve = false });
                    }
                }
            }

            CommentTags.CommentTagList list = new CommentTags.CommentTagList
            {
                SerializedData = [.. tags],
                SerializedLastUsedId = TagCount,
            };
            scrText.FileManager.GetXml<CommentTags.CommentTagList>(Arg.Any<string>()).Returns(list);
        }

        public void SetupSuccessfulSendReceive()
        {
            MockSharingLogicWrapper
                .ShareChanges(
                    Arg.Any<List<SharedProject>>(),
                    Arg.Any<SharedRepositorySource>(),
                    out Arg.Any<List<SendReceiveResult>>(),
                    Arg.Any<List<SharedProject>>()
                )
                .Returns(true);
            // Have the HandleErrors method run its first argument, which would be the ShareChanges() call.
            // This helps check that the implementation code is calling ShareChanges().
            MockSharingLogicWrapper
                .HandleErrors(Arg.Any<Action>())
                .Returns(callInfo =>
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
                contextAfter = AlternateAfter,
            };
        }

        private static string ReattachedThreadInfoStr(ReattachedThreadInfo rnt)
        {
            string[] reattachParts =
            [
                rnt.verseStr,
                rnt.selectedText,
                rnt.startPos,
                rnt.contextBefore,
                rnt.contextAfter,
            ];
            return string.Join(StringUtils.orcCharacter, reattachParts);
        }

        /// <summary>
        /// Helper method for testing changes detected when comparing incoming Paratext Comments to
        /// existing SF Notes. `modifyComment` and `modifyNoteThread` allow adjustment to the incoming Paratext
        /// Comment and the existing SF note thread (and its notes) before they are examined for differences.
        /// </summary>
        public async Task<IEnumerable<NoteThreadChange>> PrepareChangeOnSingleCommentAsync(
            Action<Paratext.Data.ProjectComments.Comment> modifyComment,
            Action<NoteThread>? modifyNoteThread = null
        )
        {
            var env = this;
            string sfProjectId = env.Project01;
            var associatedPtUser = new SFParatextUser(env.Username01);
            string ptProjectId = env.SetupProject(sfProjectId, associatedPtUser);
            UserSecret userSecret = MakeUserSecret(env.User01, env.Username01, env.ParatextUserId01);
            env.AddTextDoc(40, 1);
            env.MockGuidService.NewObjectId().Returns("thread01note01");

            string threadId = "thread01";
            string dataId = "dataId01";
            string threadOwner = env.User01;

            // Put into the SF DB a NoteThread and a Note, that will need to be updated with new PT Comment data.

            var thread01 = new NoteThread
            {
                Id = "project01:" + dataId,
                DataId = dataId,
                ThreadId = threadId,
                ProjectRef = sfProjectId,
                OwnerRef = threadOwner,
                VerseRef = new VerseRefData(40, 1, 1),
                OriginalSelectedText = "",
                OriginalContextBefore = "",
                Position = new TextAnchor(),
                OriginalContextAfter = "",
                Status = NoteStatus.Todo.InternalValue,
                Assignment = CommentThread.unassignedUser,
                Notes =
                {
                    new Note
                    {
                        DataId = $"{threadId}note01",
                        ThreadId = threadId,
                        Type = NoteType.Normal.InternalValue,
                        ConflictType = Note.NoConflictType,
                        OwnerRef = threadOwner,
                        SyncUserRef = "syncuser01",
                        DateCreated = new DateTime(2019, 12, 31, 8, 0, 0, DateTimeKind.Utc),
                        TagId = CommentTag.toDoTagId,
                        Deleted = false,
                        Status = NoteStatus.Todo.InternalValue,
                        Assignment = CommentThread.unassignedUser,
                        Content = "<p>Note content.</p>",
                        AcceptedChangeXml = null,
                    },
                },
            };
            modifyNoteThread?.Invoke(thread01);

            env.AddThread(thread01);

            // Create a PT Comment with updated data that SF will consider when composing a change report.

            XmlDocument doc = new XmlDocument();
            XmlElement commentContents = doc.CreateElement("Contents");
            commentContents.InnerXml = $"<p>Note content.</p>";
            var comment = new Paratext.Data.ProjectComments.Comment(associatedPtUser)
            {
                Thread = threadId,
                VerseRefStr = "MAT 1:1",
                SelectedText = "",
                ContextBefore = "",
                ContextAfter = "",
                StartPosition = 0,
                Date = "2019-12-31T08:00:00.0000000+00:00",
                Deleted = false,
                Status = NoteStatus.Todo,
                Type = NoteType.Normal,
                // ConflictType = (unset / default)
                AssignedUser = Paratext.Data.ProjectComments.CommentThread.unassignedUser,
                Contents = commentContents,
                AcceptedChangeXmlStr = null,
            };
            modifyComment(comment);
            env.AddParatextComment(comment);

            await using IConnection conn = await env.RealtimeService.ConnectAsync();
            IEnumerable<IDocument<NoteThread>> noteThreadDocs = await GetNoteThreadDocsAsync(conn, ["dataId01"]);
            Dictionary<string, ParatextUserProfile> ptProjectUsers = new[]
            {
                new ParatextUserProfile { OpaqueUserId = "syncuser01", Username = env.Username01 },
            }.ToDictionary(u => u.Username);
            Dictionary<int, ChapterDelta> chapterDeltas = env.GetChapterDeltasByBook(
                1,
                "Context before ",
                "Text selected"
            );

            // SUT
            IEnumerable<NoteThreadChange> changes = env.Service.GetNoteThreadChanges(
                userSecret,
                ptProjectId,
                40,
                noteThreadDocs,
                chapterDeltas,
                ptProjectUsers
            );

            return changes;
        }

        public void MakeRegistryClientReturn(HttpResponseMessage responseMessage) =>
            MockRegistryHttpClient
                .SendAsync(Arg.Any<HttpRequestMessage>(), Arg.Any<CancellationToken>())
                .Returns(responseMessage);

        public void Dispose()
        {
            Dispose(disposing: true);
            GC.SuppressFinalize(this);
        }

        protected virtual void Dispose(bool disposing)
        {
            if (disposed)
                return;
            if (disposing)
            {
                UnauthorizedHttpResponseMessage?.Dispose();
                NotFoundHttpResponseMessage?.Dispose();
            }
            disposed = true;
        }

        private static string GetAssignedUserStr(ThreadNoteComponents[] notes)
        {
            if (notes == null)
                return CommentThread.unassignedUser;
            List<ThreadNoteComponents> notesList = [.. notes];
            return notesList.LastOrDefault(n => n.assignedPTUser != null).assignedPTUser
                ?? CommentThread.unassignedUser;
        }

        private Delta GetChapterDelta(
            int chapterNum,
            int verses,
            string contextBefore,
            string selectedText,
            bool useThreadSuffix,
            bool includeExtraLastVerseSegment
        )
        {
            var chapterText = new StringBuilder();
            chapterText.Append("[ { \"insert\": { \"chapter\": { \"number\": \"" + chapterNum + "\" } }}");
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
                chapterText.Append(
                    ","
                        + "{ \"insert\": { \"verse\": { \"number\": \""
                        + i
                        + "\" } }}, "
                        + "{ \"insert\": \""
                        + before
                        + noteSelectedText
                        + after
                        + "\", "
                        + "\"attributes\": { \"segment\": \"verse_"
                        + chapterNum
                        + "_"
                        + i
                        + "\" } }"
                );
                if (i == 8 || i == 9)
                {
                    // create a new section heading after verse 8
                    chapterText.Append(
                        " ,"
                            + "{ \"insert\": \"\n\", \"attributes\": { \"para\": { \"style\": \"p\" } }}, "
                            + "{ \"insert\": \"Section heading text\", \"attributes\": { \"segment\": \"s_1\" } }, "
                            + "{ \"insert\": \"\n\", \"attributes\": { \"para\": { \"style\": \"s\" } }}, "
                            + "{ \"insert\": { \"blank\": true }, \"attributes\": { \"segment\": \"p_1\" } }"
                    );
                }
            }
            if (includeExtraLastVerseSegment)
            {
                // Add a second segment in the last verse (Note the segment name ends with "/p_1").
                string verseRef = $"verse_{chapterNum}_{verses}";
                chapterText.Append(
                    ", { \"insert\": \"\n\" },"
                        + "{ \"insert\": { \"note\": { \"caller\": \"*\" } }, "
                        + "\"attributes\": { \"segment\": \""
                        + verseRef
                        + "\" } },"
                        + "{ \"insert\": \"other text in verse\", "
                        + "\"attributes\": { \"segment\": \""
                        + verseRef
                        + "/p_1\" } }"
                );
            }
            chapterText.Append(']');
            return new Delta(JToken.Parse(chapterText.ToString()));
        }

        private static ProjectMetadata GetMetadata(string projectId, string fullname)
        {
            string json =
                "{\"identification_name\": \""
                + fullname
                + "\", \"identification_systemId\": [{\"type\": \"paratext\", \"text\": \""
                + projectId
                + "\"}]}";
            return new ProjectMetadata(JObject.Parse(json));
        }
    }
}
