using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NSubstitute;
using NUnit.Framework;
using SIL.Machine.FiniteState;
using SIL.Machine.WebApi.Services;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Realtime;
using SIL.XForge.Services;
using SIL.XForge.Utils;
using MachineProject = SIL.Machine.WebApi.Models.Project;
using Options = Microsoft.Extensions.Options.Options;

namespace SIL.XForge.Scripture.Services
{
    [TestFixture]
    public class SFProjectServiceTests
    {
        private const string Project01 = "project01";
        private const string Project02 = "project02";
        private const string Project03 = "project03";
        private const string Resource01 = "resource_project";
        private const string User01 = "user01";
        private const string User02 = "user02";
        private const string User03 = "user03";
        private const string User04 = "user04";
        private const string SiteId = "xf";

        [Test]
        public async Task InviteAsync_ProjectAdminSharingDisabled_UserInvited()
        {
            var env = new TestEnvironment();
            const string email = "newuser@example.com";

            await env.Service.InviteAsync(User01, Project01, email);
            await env.EmailService.Received(1).SendEmailAsync(email, Arg.Any<string>(),
                Arg.Is<string>(body =>
                    body.Contains($"http://localhost/projects/{Project01}?sharing=true&shareKey=1234abc")
                    && body.Contains("link will only work for this email address")));
        }

        [Test]
        public async Task InviteAsync_SpecificSharingEnabled_UserInvited()
        {
            var env = new TestEnvironment();
            const string email = "newuser@example.com";

            await env.Service.InviteAsync(User01, Project03, email);
            await env.EmailService.Received(1).SendEmailAsync(email, Arg.Any<string>(),
                Arg.Is<string>(body =>
                    body.Contains($"http://localhost/projects/{Project03}?sharing=true&shareKey=1234abc")
                    && body.Contains("link will only work for this email address")));

            // Code was recorded in database and email address was encoded in ShareKeys
            SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);
            Assert.That(projectSecret.ShareKeys.Single(sk => sk.Email == email).Key, Is.EqualTo("1234abc"));
        }

        [Test]
        public async Task Invite_SpecificSharingEnabled_UserInvitedTwiceButWithSameCode()
        {
            var env = new TestEnvironment();
            const string email = "newuser@example.com";

            SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);
            Assert.That(projectSecret.ShareKeys.Any(sk => sk.Email == email), Is.False, "setup");

            env.SecurityService.GenerateKey().Returns("1111", "3333");
            await env.Service.InviteAsync(User01, Project03, email);
            await env.EmailService.Received(1).SendEmailAsync(email, Arg.Any<string>(),
                Arg.Is<string>(body =>
                    body.Contains($"http://localhost/projects/{Project03}?sharing=true&shareKey=1111")));

            // Code was recorded in database
            projectSecret = env.ProjectSecrets.Get(Project03);
            Assert.That(projectSecret.ShareKeys.Any(sk => sk.Email == email), Is.True);

            await env.Service.InviteAsync(User01, Project03, email);
            // Invitation email was sent again, but with first code
            await env.EmailService.Received(2).SendEmailAsync(Arg.Is(email), Arg.Any<string>(),
                Arg.Is<string>(body =>
                    body.Contains($"http://localhost/projects/{Project03}?sharing=true&shareKey=1111")));

            projectSecret = env.ProjectSecrets.Get(Project03);
            Assert.That(projectSecret.ShareKeys.Single(sk => sk.Email == email).Key, Is.EqualTo("1111"),
                "Code should not have been changed");
        }

        [Test]
        public async Task InviteAsync_LinkSharingEnabled_UserInvited()
        {
            var env = new TestEnvironment();
            SFProject project = env.GetProject(Project02);
            Assert.That(project.CheckingConfig.ShareEnabled, Is.True, "setup");
            Assert.That(project.CheckingConfig.ShareLevel, Is.EqualTo(CheckingShareLevel.Anyone), "setup: link sharing should be enabled");
            const string email = "newuser@example.com";
            // SUT
            await env.Service.InviteAsync(User01, Project02, email);
            await env.EmailService.Received(1).SendEmailAsync(email, Arg.Any<string>(),
                Arg.Is<string>(body => body.Contains($"http://localhost/projects/{Project02}?sharing=true&shareKey=1234abc")));
        }

        [Test]
        public async Task InviteAsync_SharingDisabled_ForbiddenError()
        {
            var env = new TestEnvironment();
            Assert.ThrowsAsync<ForbiddenException>(
                () => env.Service.InviteAsync(User02, Project01, "newuser@example.com"));
            await env.EmailService.DidNotReceiveWithAnyArgs().SendEmailAsync(default, default, default);
        }

        [Test]
        public async Task InviteAsync_SpecificSharingEnabled_ProjectUserNotInvited()
        {
            var env = new TestEnvironment();
            const string email = "user01@example.com";
            SFProject project = env.GetProject(Project03);
            Assert.That(project.UserRoles.ContainsKey(User01), Is.True,
                "setup - user should already be a project user");

            Assert.That(await env.Service.InviteAsync(User01, Project03, email), Is.False);
            project = env.GetProject(Project03);
            Assert.That(project.UserRoles.ContainsKey(User01), Is.True, "user should still be a project user");

            SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);
            Assert.That(projectSecret.ShareKeys.Any(sk => sk.Email == email), Is.False,
                "no sharekey should have been added");

            // Email should not have been sent
            await env.EmailService.DidNotReceiveWithAnyArgs().SendEmailAsync(null, default, default);
        }

        [Test]
        public void CheckLinkSharingAsync_LinkSharingDisabledAndUserOnProject_Success()
        {
            var env = new TestEnvironment();
            SFProject project = env.GetProject(Project01);
            Assert.That(project.UserRoles.ContainsKey(User02), Is.True, "setup");
            Assert.DoesNotThrowAsync(() => env.Service.CheckLinkSharingAsync(User02, Project01));
        }

        [Test]
        public void CheckLinkSharingAsync_LinkSharingDisabledAndUserNotOnProject_Forbidden()
        {
            var env = new TestEnvironment();
            SFProject project = env.GetProject(Project01);
            Assert.That(project.UserRoles.ContainsKey(User03), Is.False, "setup");
            Assert.ThrowsAsync<ForbiddenException>(() => env.Service.CheckLinkSharingAsync(User03, Project01));
        }

        [Test]
        public async Task CheckLinkSharingAsync_LinkSharingEnabled_UserJoined()
        {
            var env = new TestEnvironment();
            SFProject project = env.GetProject(Project02);
            Assert.That(project.UserRoles.ContainsKey(User03), Is.False, "setup");

            await env.Service.CheckLinkSharingAsync(User03, Project02);
            project = env.GetProject(Project02);
            Assert.That(project.UserRoles.ContainsKey(User03), Is.True);
            User user = env.GetUser(User03);
            Assert.That(user.Sites[SiteId].Projects, Contains.Item(Project02));
        }

        [Test]
        public async Task CheckLinkSharingAsync_LinkSharingEnabledAndShareKeyExists_UserJoinedAndKeyRemoved()
        {
            var env = new TestEnvironment();
            SFProject project = env.GetProject(Project03);
            SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);

            Assert.That(project.UserRoles.ContainsKey(User03), Is.False, "setup");
            Assert.That(projectSecret.ShareKeys.Any(sk => sk.Key == "key1234"), Is.True, "setup");

            await env.Service.UpdateSettingsAsync(User01, Project03, new SFProjectSettings { ShareLevel = CheckingShareLevel.Anyone });
            await env.Service.CheckLinkSharingAsync(User03, Project03);
            project = env.GetProject(Project03);
            projectSecret = env.ProjectSecrets.Get(Project03);
            Assert.That(project.UserRoles.ContainsKey(User03), Is.True, "User should have been added to project");
            Assert.That(projectSecret.ShareKeys.Any(sk => sk.Key == "key1234"), Is.False,
                "Key should have been removed from project");
        }

        [Test]
        public void CheckLinkSharingAsync_SpecificSharingUnexpectedEmail_ForbiddenError()
        {
            var env = new TestEnvironment();
            SFProject project = env.GetProject(Project03);
            SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);

            Assert.That(project.UserRoles.ContainsKey(User04), Is.False, "setup");
            Assert.That(projectSecret.ShareKeys.Any(sk => sk.Email == "user04@example.com"), Is.False, "setup");

            Assert.ThrowsAsync<ForbiddenException>(() => env.Service.CheckLinkSharingAsync(User04, Project03),
                "The user should be forbidden to join the project: Email address was not in ShareKeys list.");
        }

        [Test]
        public void CheckLinkSharingAsync_SpecificSharingAndWrongCode_ForbiddenError()
        {
            var env = new TestEnvironment();
            SFProject project = env.GetProject(Project03);
            SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);

            Assert.That(project.UserRoles.ContainsKey(User03), Is.False, "setup");
            Assert.That(projectSecret.ShareKeys.Any(sk => sk.Email == "user03@example.com"), Is.True, "setup");

            Assert.ThrowsAsync<ForbiddenException>(() => env.Service.CheckLinkSharingAsync(User03, Project03),
                "The user should be forbidden to join the project: Email address was in ShareKeys list, but wrong code was given.");
        }

        [Test]
        public async Task CheckLinkSharingAsync_SpecificSharingAndRightKey_UserJoined()
        {
            var env = new TestEnvironment();
            SFProject project = env.GetProject(Project03);
            SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);

            Assert.That(project.UserRoles.ContainsKey(User03), Is.False, "setup");
            Assert.That(projectSecret.ShareKeys.Any(sk => sk.Key == "key1234"), Is.True, "setup");
            Assert.That(projectSecret.ShareKeys.Count, Is.EqualTo(3), "setup");

            await env.Service.CheckLinkSharingAsync(User03, Project03, "key1234");

            project = env.GetProject(Project03);
            projectSecret = env.ProjectSecrets.Get(Project03);
            Assert.That(project.UserRoles.ContainsKey(User03), Is.True, "User should have been added to project");
            Assert.That(projectSecret.ShareKeys.Any(sk => sk.Key == "key1234"), Is.False,
                "Key should have been removed from project");
        }

        [Test]
        public async Task CheckLinkSharingAsync_ShareDisabledAndKeyValid_UserJoined()
        {
            var env = new TestEnvironment();
            SFProject project = env.GetProject(Project03);
            SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);

            Assert.That(project.UserRoles.ContainsKey(User03), Is.False, "setup");
            Assert.That(projectSecret.ShareKeys.Any(sk => sk.Key == "key1234"), Is.True, "setup");
            Assert.That(projectSecret.ShareKeys.Count, Is.EqualTo(3), "setup");

            await env.Service.UpdateSettingsAsync(User01, Project03, new SFProjectSettings { ShareEnabled = false });
            project = env.GetProject(Project03);
            Assert.That(project.CheckingConfig.ShareEnabled, Is.False, "setup");
            await env.Service.CheckLinkSharingAsync(User03, Project03, "key1234");

            project = env.GetProject(Project03);
            projectSecret = env.ProjectSecrets.Get(Project03);
            Assert.That(project.UserRoles.ContainsKey(User03), Is.True, "User should have been added to project");
            Assert.That(projectSecret.ShareKeys.Any(sk => sk.Key == "key1234"), Is.False,
                "Key should have been removed from project");
        }

        [Test]
        public async Task IsAlreadyInvitedAsync_BadInput_False()
        {
            var env = new TestEnvironment();

            Assert.That(await env.Service.IsAlreadyInvitedAsync(User01, Project03, null), Is.False);

            Assert.That(await env.Service.IsAlreadyInvitedAsync(User01, Project03, ""), Is.False);

            Assert.That(await env.Service.IsAlreadyInvitedAsync(User01, Project03, "junk"), Is.False);

            Assert.That(await env.Service.IsAlreadyInvitedAsync(User03, Project02, "nothing"), Is.False);
        }

        [Test]
        public async Task IsAlreadyInvitedAsync_IsInvited_True()
        {
            var env = new TestEnvironment();

            Assert.That(await env.Service.IsAlreadyInvitedAsync(User01, Project03, "bob@example.com"), Is.True);
        }

        [Test]
        public async Task IsAlreadyInvitedAsync_NotInvitedButOnProject_False()
        {
            var env = new TestEnvironment();

            Assert.That(await env.Service.IsAlreadyInvitedAsync(User01, Project03, "user01@example.com"), Is.False);
            Assert.That(await env.Service.IsAlreadyInvitedAsync(User03, Project02, "user01@example.com"), Is.False);
        }

        [Test]
        public async Task IsAlreadyInvitedAsync_NotInvitedOrOnProject_False()
        {
            var env = new TestEnvironment();

            Assert.That(await env.Service.IsAlreadyInvitedAsync(User01, Project03, "unheardof@example.com"), Is.False);
            Assert.That(await env.Service.IsAlreadyInvitedAsync(User03, Project02, "nobody@example.com"), Is.False);
        }

        public async Task InvitedUsers_Reports()
        {
            var env = new TestEnvironment();
            // Project with no outstanding invitations
            Assert.That((await env.Service.InvitedUsersAsync(User01, Project01)).Length, Is.EqualTo(0));

            // Project with several outstanding invitations
            var invitees = (await env.Service.InvitedUsersAsync(User01, Project03));
            Assert.That(invitees.Length, Is.EqualTo(3));
            string[] expectedEmailList = { "bob@example.com", "user02@example.com", "bill@example.com" };
            foreach (var expectedEmail in expectedEmailList)
            {
                Assert.That(Array.Exists(invitees, invitee => invitee == expectedEmail));
            }
        }

        [Test]
        public void InvitedUsers_SystemAdmin_NoSpecialAccess()
        {
            var env = new TestEnvironment();

            // User04 is a system admin, but not a project-admin or even a user on Project03
            Assert.That(env.GetProject(Project03).UserRoles.ContainsKey(User04), Is.False, "test setup");
            Assert.That(env.GetUser(User04).Role, Is.EqualTo(SystemRole.SystemAdmin), "test setup");

            Assert.ThrowsAsync<ForbiddenException>(() => (env.Service.InvitedUsersAsync(User04, Project03)),
                "should have been forbidden");
        }

        [Test]
        public void InvitedUsers_NonProjectAdmin_Forbidden()
        {
            var env = new TestEnvironment();
            // User02 is not an admin on Project01
            Assert.That(env.GetProject(Project01).UserRoles[User02],
                Is.Not.EqualTo(SFProjectRole.Administrator), "test setup");
            Assert.That(env.GetUser(User02).Role, Is.Not.EqualTo(SystemRole.SystemAdmin), "test setup");
            Assert.ThrowsAsync<ForbiddenException>(() => env.Service.InvitedUsersAsync(User02, Project01),
                "should have been forbidden");
        }

        [Test]
        public void InvitedUsers_BadProject_Error()
        {
            var env = new TestEnvironment();

            Assert.ThrowsAsync<DataNotFoundException>(() => env.Service.InvitedUsersAsync(User02, "bad-project-id"));
        }

        [Test]
        public void InvitedUsers_BadUser_Forbidden()
        {
            var env = new TestEnvironment();

            Assert.ThrowsAsync<ForbiddenException>(() => env.Service.InvitedUsersAsync("bad-user-id", Project01));
        }


        [Test]
        public void UninviteUser_BadProject_Error()
        {
            var env = new TestEnvironment();
            Assert.ThrowsAsync<DataNotFoundException>(() => env.Service.UninviteUserAsync(User02, "nonexistent-project",
                "some@email.com"));
        }

        [Test]
        public void UninviteUser_NonProjectAdmin_Error()
        {
            var env = new TestEnvironment();
            // User02 is not an admin on Project01
            Assert.That(env.GetProject(Project01).UserRoles[User02], Is.Not.EqualTo(SFProjectRole.Administrator),
                "test setup");
            Assert.ThrowsAsync<ForbiddenException>(() => env.Service.UninviteUserAsync(User02, Project01,
                "some@email.com"), "should have been forbidden");
        }

        [Test]
        public async Task UninviteUser_BadEmail_Ignored()
        {
            var env = new TestEnvironment();
            var initialInvitationCount = 3;
            Assert.That((await env.ProjectSecrets.GetAsync(Project03)).ShareKeys.Count,
                Is.EqualTo(initialInvitationCount), "test setup");

            await env.Service.UninviteUserAsync(User01, Project03, "unknown@email.com");
            Assert.That((await env.ProjectSecrets.GetAsync(Project03)).ShareKeys.Count,
                Is.EqualTo(initialInvitationCount), "should not have changed");
        }

        [Test]
        public async Task UninviteUser_RemovesInvitation()
        {
            var env = new TestEnvironment();
            var initialInvitationCount = 3;
            Assert.That((await env.ProjectSecrets.GetAsync(Project03)).ShareKeys.Count,
                Is.EqualTo(initialInvitationCount), "test setup");
            Assert.That((await env.ProjectSecrets.GetAsync(Project03)).ShareKeys
                .Any(sk => sk.Email == "bob@example.com"), Is.True, "test setup");
            Assert.That((await env.ProjectSecrets.GetAsync(Project03)).ShareKeys.Count,
                Is.EqualTo(initialInvitationCount), "test setup");

            await env.Service.UninviteUserAsync(User01, Project03, "bob@example.com");
            Assert.That((await env.ProjectSecrets.GetAsync(Project03)).ShareKeys.Count,
                Is.EqualTo(initialInvitationCount - 1), "unexpected number of outstanding invitations");
            Assert.That((await env.ProjectSecrets.GetAsync(Project03)).ShareKeys
                .Any(sk => sk.Email == "bob@example.com"), Is.False, "should not still have uninvited email address");
        }

        [Test]
        public void UninviteUser_SystemAdmin_NoSpecialAccess()
        {
            var env = new TestEnvironment();
            // User04 is a system admin, but not a project-admin or even a user on Project03
            Assert.That(env.GetProject(Project03).UserRoles.ContainsKey(User04), Is.False, "test setup");
            Assert.That(env.GetUser(User04).Role, Is.EqualTo(SystemRole.SystemAdmin), "test setup");

            Assert.ThrowsAsync<ForbiddenException>(() => env.Service.UninviteUserAsync(User04, Project03, "bob@example.com"), "should have been forbidden");
        }

        [Test]
        public async Task AddUserAsync_ShareKeyExists_AddsUserAndRemovesKey()
        {
            var env = new TestEnvironment();
            SFProject project = env.GetProject(Project03);
            SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);

            Assert.That(project.UserRoles.ContainsKey(User03), Is.False, "setup");
            Assert.That(projectSecret.ShareKeys.Any(sk => sk.Key == "key1234"), Is.True, "setup");
            env.ParatextService.TryGetProjectRoleAsync(Arg.Any<UserSecret>(), Arg.Any<string>())
                .Returns(Task.FromResult(Attempt.Success(SFProjectRole.Translator)));

            await env.Service.AddUserAsync(User03, Project03, null);
            project = env.GetProject(Project03);
            projectSecret = env.ProjectSecrets.Get(Project03);
            Assert.That(project.UserRoles.ContainsKey(User03), Is.True, "User should have been added to project");
            Assert.That(projectSecret.ShareKeys.Any(sk => sk.Key == "key1234"), Is.False,
                "Key should have been removed from project");
        }

        [Test]
        public async Task UpdateSettingsAsync_ChangeSourceProject_RecreateMachineProjectAndSync()
        {
            var env = new TestEnvironment();

            await env.Service.UpdateSettingsAsync(User01, Project01, new SFProjectSettings
            {
                SourceParatextId = "changedId"
            });

            SFProject project = env.GetProject("project01");
            Assert.That(project.TranslateConfig.Source.ParatextId, Is.EqualTo("changedId"));
            Assert.That(project.TranslateConfig.Source.Name, Is.EqualTo("NewSource"));

            await env.EngineService.Received().RemoveProjectAsync(Arg.Any<string>());
            await env.EngineService.Received().AddProjectAsync(Arg.Any<MachineProject>());
            await env.SyncService.Received().SyncAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>());
        }

        [Test]
        public async Task UpdateSettingsAsync_EnableTranslate_CreateMachineProjectAndSync()
        {
            var env = new TestEnvironment();

            await env.Service.UpdateSettingsAsync(User01, Project01, new SFProjectSettings
            {
                TranslationSuggestionsEnabled = true,
                SourceParatextId = "changedId"
            });

            SFProject project = env.GetProject(Project01);
            Assert.That(project.TranslateConfig.TranslationSuggestionsEnabled, Is.True);
            Assert.That(project.TranslateConfig.Source.ParatextId, Is.EqualTo("changedId"));
            Assert.That(project.TranslateConfig.Source.Name, Is.EqualTo("NewSource"));

            await env.EngineService.DidNotReceive().RemoveProjectAsync(Arg.Any<string>());
            await env.EngineService.Received().AddProjectAsync(Arg.Any<Machine.WebApi.Models.Project>());
            await env.SyncService.Received().SyncAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>());
        }

        [Test]
        public async Task UpdateSettingsAsync_EnableChecking_Sync()
        {
            var env = new TestEnvironment();

            await env.Service.UpdateSettingsAsync(User01, Project01, new SFProjectSettings { CheckingEnabled = true });

            SFProject project = env.GetProject(Project01);
            Assert.That(project.CheckingConfig.CheckingEnabled, Is.True);

            await env.EngineService.DidNotReceive().RemoveProjectAsync(Arg.Any<string>());
            await env.EngineService.DidNotReceive().AddProjectAsync(Arg.Any<Machine.WebApi.Models.Project>());
            await env.SyncService.Received().SyncAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>());
        }

        [Test]
        public async Task UpdateSettingsAsync_EnableSharing_NoSync()
        {
            var env = new TestEnvironment();

            await env.Service.UpdateSettingsAsync(User01, Project01, new SFProjectSettings { ShareEnabled = true });

            SFProject project = env.GetProject(Project01);
            Assert.That(project.CheckingConfig.ShareEnabled, Is.True);

            await env.EngineService.DidNotReceive().RemoveProjectAsync(Arg.Any<string>());
            await env.EngineService.DidNotReceive().AddProjectAsync(Arg.Any<Machine.WebApi.Models.Project>());
            await env.SyncService.DidNotReceive().SyncAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>());
        }

        [Test]
        public async Task DeleteAsync()
        {
            var env = new TestEnvironment();
            string ptProjectDir = Path.Combine("xforge", "sync", "paratext_" + Project01);
            env.FileSystemService.DirectoryExists(ptProjectDir).Returns(true);
            await env.Service.DeleteProjectAsync(User01, Project01);

            Assert.That(env.ContainsProject(Project01), Is.False);
            User user = env.GetUser(User01);
            Assert.That(user.Sites[SiteId].Projects, Does.Not.Contain(Project01));
            await env.EngineService.Received().RemoveProjectAsync(Project01);
            env.FileSystemService.Received().DeleteDirectory(ptProjectDir);
            Assert.That(env.ProjectSecrets.Contains(Project01), Is.False);
        }

        [Test]
        public async Task CreateProjectAsync_NotExisting_Created()
        {
            var env = new TestEnvironment();
            int projectCount = env.RealtimeService.GetRepository<SFProject>().Query().Count();
            env.ParatextService.TryGetProjectRoleAsync(Arg.Any<UserSecret>(), Arg.Any<string>())
               .Returns(Task.FromResult(Attempt.Success(SFProjectRole.Administrator)));
            // SUT
            string sfProjectId = await env.Service.CreateProjectAsync(User01, new SFProjectCreateSettings()
            {
                ParatextId = "ptProject123"
            });
            Assert.That(env.ContainsProject(sfProjectId), Is.True);
            Assert.That(env.RealtimeService.GetRepository<SFProject>().Query().Count(),
                Is.EqualTo(projectCount + 1), "should have increased");
            SFProject newProject = env.RealtimeService.GetRepository<SFProject>().Get(sfProjectId);
            Assert.That(newProject.CheckingConfig.ShareEnabled, Is.False, "Should default to not shared (SF-1142)");
        }

        [Test]
        public void CreateProjectAsync_AlreadyExists_Error()
        {
            var env = new TestEnvironment();
            int projectCount = env.RealtimeService.GetRepository<SFProject>().Query().Count();
            env.ParatextService.TryGetProjectRoleAsync(Arg.Any<UserSecret>(), Arg.Any<string>())
               .Returns(Task.FromResult(Attempt.Success(SFProjectRole.Administrator)));
            SFProject existingSfProject = env.GetProject(Project01);
            // SUT
            InvalidOperationException thrown = Assert.ThrowsAsync<InvalidOperationException>(
                () => env.Service.CreateProjectAsync(User01, new SFProjectCreateSettings()
                {
                    ParatextId = existingSfProject.ParatextId
                }));
            Assert.That(thrown.Message, Does.Contain(SFProjectService.ErrorAlreadyConnectedKey));
            Assert.That(env.RealtimeService.GetRepository<SFProject>().Query().Count(),
                Is.EqualTo(projectCount), "should not have changed");
        }

        [Test]
        public async Task CreateResourceProjectAsync_NotExisting_Created()
        {
            var env = new TestEnvironment();
            int projectCount = env.RealtimeService.GetRepository<SFProject>().Query().Count();
            // SUT
            string sfProjectId = await env.Service.CreateResourceProjectAsync(User01, "resource_project");
            Assert.That(env.ContainsProject(sfProjectId), Is.True);
            Assert.That(env.RealtimeService.GetRepository<SFProject>().Query().Count(),
                Is.EqualTo(projectCount + 1), "should have increased");
        }

        [Test]
        public void CreateResourceProjectAsync_AlreadyExists_Error()
        {
            var env = new TestEnvironment();
            int projectCount = env.RealtimeService.GetRepository<SFProject>().Query().Count();
            SFProject existingSfProject = env.GetProject(Resource01);
            // SUT
            InvalidOperationException thrown = Assert.ThrowsAsync<InvalidOperationException>(
                () => env.Service.CreateResourceProjectAsync(User01, existingSfProject.ParatextId));
            Assert.That(thrown.Message, Does.Contain(SFProjectService.ErrorAlreadyConnectedKey));
            Assert.That(env.RealtimeService.GetRepository<SFProject>().Query().Count(),
                Is.EqualTo(projectCount), "should not have changed");
        }

        [Test]
        public async Task AddUserToResourceProjectAsync_UserResourcePermission()
        {
            var env = new TestEnvironment();
            env.ParatextService.GetResourcePermissionAsync(Arg.Any<UserSecret>(), Arg.Any<string>(), User01)
                .Returns(Task.FromResult(TextInfoPermission.Read));

            User user = env.GetUser(User01);
            Assert.That(user.Sites[SiteId].Resources.Contains(Resource01), Is.False, "setup");

            await env.Service.AddUserToResourceProjectAsync(User01, Resource01);

            user = env.GetUser(User01);
            Assert.That(user.Sites[SiteId].Resources.Contains(Resource01), Is.True, "User can access resource");
        }

        [Test]
        public async Task AddUserToResourceProjectAsync_UserResourceNoPermission()
        {
            var env = new TestEnvironment();
            env.ParatextService.GetResourcePermissionAsync(Arg.Any<UserSecret>(), Arg.Any<string>(), User01)
                .Returns(Task.FromResult(TextInfoPermission.None));

            User user = env.GetUser(User01);
            Assert.That(user.Sites[SiteId].Resources.Contains(Resource01), Is.False, "setup");

            await env.Service.AddUserToResourceProjectAsync(User01, Resource01);

            user = env.GetUser(User01);
            Assert.That(user.Sites[SiteId].Resources.Contains(Resource01), Is.False, "user cannot access resource");
        }

        [Test]
        public async Task AddUserToResourceProjectAsync_UserNoResourcePermission_RemovesResource()
        {
            var env = new TestEnvironment();
            env.ParatextService.GetResourcePermissionAsync(Arg.Any<UserSecret>(), Arg.Any<string>(), User01)
                .Returns(Task.FromResult(TextInfoPermission.Read));

            User user = env.GetUser(User01);
            Assert.That(user.Sites[SiteId].Resources.Contains(Resource01), Is.False, "setup");

            await env.Service.AddUserToResourceProjectAsync(User01, Resource01);

            user = env.GetUser(User01);
            Assert.That(user.Sites[SiteId].Resources.Contains(Resource01), Is.True, "user can access resource");

            // The user's access was removed in Paratext
            env.ParatextService.GetResourcePermissionAsync(Arg.Any<UserSecret>(), Arg.Any<string>(), User01)
                .Returns(Task.FromResult(TextInfoPermission.None));

            await env.Service.AddUserToResourceProjectAsync(User01, Resource01);

            user = env.GetUser(User01);
            Assert.That(user.Sites[SiteId].Resources.Contains(Resource01), Is.False, "user now cannot access resource");
        }

        private class TestEnvironment
        {
            public TestEnvironment()
            {
                RealtimeService = new SFMemoryRealtimeService();
                RealtimeService.AddRepository("users", OTType.Json0, new MemoryRepository<User>(new[]
                {
                    new User
                    {
                        Id = User01,
                        Email = "user01@example.com",
                        Sites = new Dictionary<string, Site>
                        {
                            { SiteId, new Site { Projects = { Project01, Project03 } } }
                        }
                    },
                    new User
                    {
                        Id = User02,
                        Email = "user02@example.com",
                        Sites = new Dictionary<string, Site>
                        {
                            { SiteId, new Site { Projects = { Project01, Project02, Project03 } } }
                        }
                    },
                    new User
                    {
                        Id = User03,
                        Email = "user03@example.com",
                        Sites = new Dictionary<string, Site> { { SiteId, new Site() } }
                    },
                    new User
                    {
                        Id = User04,
                        Email = "user04@example.com",
                        Sites = new Dictionary<string,Site>(),
                        Role = SystemRole.SystemAdmin
                    }
                }));
                RealtimeService.AddRepository("sf_projects", OTType.Json0, new MemoryRepository<SFProject>(
                    new[]
                    {
                        new SFProject
                        {
                            Id = Project01,
                            ParatextId = "paratext_" + Project01,
                            Name = "project01",
                            ShortName = "P01",
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
                        new SFProject
                        {
                            Id = Project02,
                            Name = "project02",
                            ShortName = "P02",
                            CheckingConfig = new CheckingConfig
                            {
                                ShareEnabled = true,
                                ShareLevel = CheckingShareLevel.Anyone
                            },
                            UserRoles =
                            {
                                { User02, SFProjectRole.Administrator }
                            },
                        },
                        new SFProject
                        {
                            Id = Project03,
                            Name = "project03",
                            ShortName = "P03",
                            CheckingConfig = new CheckingConfig
                            {
                                ShareEnabled = true,
                                ShareLevel = CheckingShareLevel.Specific
                            },
                            UserRoles =
                            {
                                { User01, SFProjectRole.Administrator },
                                { User02, SFProjectRole.Translator }
                            }
                        },
                        new SFProject
                        {
                            Id = Resource01,
                            ParatextId = "resid_is_16_char",
                            Name = "resource project",
                            ShortName = "RES",
                        }
                    }));
                RealtimeService.AddRepository("sf_project_user_configs", OTType.Json0,
                    new MemoryRepository<SFProjectUserConfig>(new[]
                    {
                        new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId(Project01, User01) },
                        new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId(Project01, User02) },
                        new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId(Project02, User02) },
                        new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId(Project03, User01) },
                        new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId(Project03, User02) }
                    }));
                var siteOptions = Substitute.For<IOptions<SiteOptions>>();
                siteOptions.Value.Returns(new SiteOptions
                {
                    Id = SiteId,
                    Name = "xForge",
                    Origin = new Uri("http://localhost"),
                    SiteDir = "xforge"
                });
                var audioService = Substitute.For<IAudioService>();
                EmailService = Substitute.For<IEmailService>();
                ProjectSecrets = new MemoryRepository<SFProjectSecret>(new[]
                {
                    new SFProjectSecret { Id = Project01 },
                    new SFProjectSecret { Id = Project02 },
                    new SFProjectSecret
                    {
                        Id = Project03,
                        ShareKeys = new List<ShareKey>
                        {
                            new ShareKey { Email = "bob@example.com", Key = "key1111" },
                            new ShareKey { Email = "user03@example.com", Key = "key1234" },
                            new ShareKey { Email = "bill@example.com", Key = "key2222" }
                        }
                    },
                });
                EngineService = Substitute.For<IEngineService>();
                SyncService = Substitute.For<ISyncService>();
                SyncService.SyncAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>())
                    .Returns(Task.CompletedTask);
                ParatextService = Substitute.For<IParatextService>();
                IReadOnlyList<ParatextProject> ptProjects = new[]
                {
                    new ParatextProject
                    {
                        ParatextId = "changedId",
                        Name = "NewSource",
                        LanguageTag = "qaa"
                    },
                    new ParatextProject
                    {
                        ParatextId = GetProject(Project01).ParatextId
                    },
                    new ParatextProject
                    {
                        ParatextId = "ptProject123"
                    }
                };
                ParatextService.GetProjectsAsync(Arg.Any<UserSecret>()).Returns(Task.FromResult(ptProjects));
                IReadOnlyList<ParatextResource> ptResources = new[]
                {
                    new ParatextResource
                    {
                        ParatextId = "resource_project",
                        Name = "ResourceProject",
                        LanguageTag = "qaa"
                    },
                    new ParatextResource
                    {
                        ParatextId = GetProject(Resource01).ParatextId
                    }
                };
                ParatextService.GetResources(Arg.Any<UserSecret>()).Returns(ptResources);
                var userSecrets = new MemoryRepository<UserSecret>(new[]
                {
                    new UserSecret { Id = User01 },
                    new UserSecret { Id = User02 },
                    new UserSecret { Id = User03 }
                });
                var translateMetrics = new MemoryRepository<TranslateMetrics>();
                FileSystemService = Substitute.For<IFileSystemService>();
                var options = Options.Create(new LocalizationOptions { ResourcesPath = "Resources" });
                var factory = new ResourceManagerStringLocalizerFactory(options, NullLoggerFactory.Instance);
                Localizer = new StringLocalizer<SharedResource>(factory);
                SecurityService = Substitute.For<ISecurityService>();
                SecurityService.GenerateKey().Returns("1234abc");
                var transceleratorService = Substitute.For<ITransceleratorService>();

                Service = new SFProjectService(RealtimeService, siteOptions, audioService, EmailService, ProjectSecrets,
                    SecurityService, FileSystemService, EngineService, SyncService, ParatextService, userSecrets,
                    translateMetrics, Localizer, transceleratorService);
            }

            public SFProjectService Service { get; }
            public IEngineService EngineService { get; }
            public ISyncService SyncService { get; }
            public SFMemoryRealtimeService RealtimeService { get; }
            public IFileSystemService FileSystemService { get; }
            public MemoryRepository<SFProjectSecret> ProjectSecrets { get; }
            public IEmailService EmailService { get; }
            public ISecurityService SecurityService { get; }
            public IParatextService ParatextService { get; }
            public IStringLocalizer<SharedResource> Localizer { get; }

            public SFProject GetProject(string id)
            {
                return RealtimeService.GetRepository<SFProject>().Get(id);
            }

            public bool ContainsProject(string id)
            {
                return RealtimeService.GetRepository<SFProject>().Contains(id);
            }

            public User GetUser(string id)
            {
                return RealtimeService.GetRepository<User>().Get(id);
            }
        }
    }
}
