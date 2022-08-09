using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NSubstitute;
using NUnit.Framework;
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
        private const string Project04 = "project04";
        private const string Project05 = "project05";
        private const string Project06 = "project06";
        private const string Resource01 = "resource_project";
        private const string SourceOnly = "source_only";
        private const string Resource01PTId = "resid_is_16_char";
        private const string User01 = "user01";
        private const string User02 = "user02";
        private const string User03 = "user03";
        private const string User04 = "user04";
        private const string User05 = "user05";
        private const string LinkExpiredUser = "linkexpireduser";
        private const string SiteId = "xf";
        private const string PTProjectIdNotYetInSF = "paratext_notYetInSF";

        [Test]
        public async Task InviteAsync_ProjectAdminSharingDisabled_UserInvited()
        {
            var env = new TestEnvironment();
            const string email = "newuser@example.com";
            const string role = SFProjectRole.CommunityChecker;

            await env.Service.InviteAsync(User01, Project01, email, "en", role);
            await env.EmailService
                .Received(1)
                .SendEmailAsync(
                    email,
                    Arg.Any<string>(),
                    Arg.Is<string>(
                        body =>
                            body.Contains($"http://localhost/projects/{Project01}?sharing=true&shareKey=1234abc")
                            && body.Contains("The project invitation link expires in 14 days")
                    )
                );
            SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project01);
            Assert.That(projectSecret.ShareKeys.Single(sk => sk.Email == email).ProjectRole, Is.EqualTo(role));
        }

        [Test]
        public async Task InviteAsync_SpecificSharingEnabled_UserInvited()
        {
            var env = new TestEnvironment();
            const string email = "newuser@example.com";
            const string role = SFProjectRole.CommunityChecker;

            await env.Service.InviteAsync(User01, Project03, email, "en", role);
            await env.EmailService
                .Received(1)
                .SendEmailAsync(
                    email,
                    Arg.Any<string>(),
                    Arg.Is<string>(
                        body =>
                            body.Contains($"http://localhost/projects/{Project03}?sharing=true&shareKey=1234abc")
                            && body.Contains("The project invitation link expires in 14 days")
                    )
                );

            // Code was recorded in database and email address was encoded in ShareKeys
            SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);
            Assert.That(projectSecret.ShareKeys.Single(sk => sk.Email == email).Key, Is.EqualTo("1234abc"));
            Assert.That(projectSecret.ShareKeys.Single(sk => sk.Email == email).ProjectRole, Is.EqualTo(role));
        }

        [Test]
        public async Task InviteAsync_SpecificSharingEnabled_UserInvitedTwiceButWithSameCode()
        {
            var env = new TestEnvironment();
            const string email = "bob@example.com";
            const string initialRole = SFProjectRole.CommunityChecker;
            const string endingRole = SFProjectRole.SFObserver;

            SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);
            Assert.That(
                projectSecret.ShareKeys.Single(sk => sk.Email == email).ExpirationTime,
                Is.LessThan(DateTime.UtcNow.AddDays(2)),
                "setup"
            );
            var invitees = await env.Service.InvitedUsersAsync(User01, Project03);
            Assert.That(
                invitees.Select(i => i.Email),
                Is.EquivalentTo(
                    new[] { "bob@example.com", "expired@example.com", "user03@example.com", "bill@example.com" }
                ),
                "setup"
            );
            Assert.That(invitees[0].Role == initialRole);

            await env.Service.InviteAsync(User01, Project03, email, "en", endingRole);
            // Invitation email was resent but with original code and updated time
            await env.EmailService
                .Received(1)
                .SendEmailAsync(
                    Arg.Is(email),
                    Arg.Any<string>(),
                    Arg.Is<string>(
                        body => body.Contains($"http://localhost/projects/{Project03}?sharing=true&shareKey=key1111")
                    )
                );

            projectSecret = env.ProjectSecrets.Get(Project03);
            Assert.That(
                projectSecret.ShareKeys.Single(sk => sk.Email == email).Key,
                Is.EqualTo("key1111"),
                "Code should not have been changed"
            );
            Assert.That(
                projectSecret.ShareKeys.Single(sk => sk.Email == email).ExpirationTime,
                Is.GreaterThan(DateTime.UtcNow.AddDays(13))
            );
            Assert.That(projectSecret.ShareKeys.Single(sk => sk.Email == email).ProjectRole, Is.EqualTo(endingRole));

            invitees = await env.Service.InvitedUsersAsync(User01, Project03);
            Assert.That(
                invitees.Select(i => i.Email),
                Is.EquivalentTo(
                    new[] { "bob@example.com", "expired@example.com", "user03@example.com", "bill@example.com" }
                )
            );
        }

        [Test]
        public async Task InviteAsync_SpecificSharingEnabledCodeExpired_UserInvitedWithNewCode()
        {
            var env = new TestEnvironment();
            const string email = "expired@example.com";
            const string role = SFProjectRole.CommunityChecker;

            SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);
            Assert.That(
                projectSecret.ShareKeys.Any(sk => sk.Email == email && sk.ExpirationTime < DateTime.UtcNow),
                Is.True,
                "setup"
            );

            env.SecurityService.GenerateKey().Returns("newkey");
            await env.Service.InviteAsync(User01, Project03, email, "en", role);
            // Invitation email was sent with a new code
            await env.EmailService
                .Received(1)
                .SendEmailAsync(
                    Arg.Is(email),
                    Arg.Any<string>(),
                    Arg.Is<string>(
                        body => body.Contains($"http://localhost/projects/{Project03}?sharing=true&shareKey=newkey")
                    )
                );

            projectSecret = env.ProjectSecrets.Get(Project03);
            Assert.That(
                projectSecret.ShareKeys.Single(sk => sk.Email == email).Key,
                Is.EqualTo("newkey"),
                "Code should not have been changed"
            );
            Assert.That(projectSecret.ShareKeys.Single(sk => sk.Email == email).ProjectRole, Is.EqualTo(role));
        }

        [Test]
        public async Task InviteAsync_LinkSharingEnabled_UserInvited()
        {
            var env = new TestEnvironment();
            SFProject project = env.GetProject(Project02);
            Assert.That(project.CheckingConfig.ShareEnabled, Is.True, "setup");
            Assert.That(
                project.CheckingConfig.ShareLevel,
                Is.EqualTo(CheckingShareLevel.Anyone),
                "setup: link sharing should be enabled"
            );
            const string email = "newuser@example.com";
            const string role = SFProjectRole.CommunityChecker;
            // SUT
            await env.Service.InviteAsync(User02, Project02, email, "en", role);
            await env.EmailService
                .Received(1)
                .SendEmailAsync(
                    email,
                    Arg.Any<string>(),
                    Arg.Is<string>(
                        body => body.Contains($"http://localhost/projects/{Project02}?sharing=true&shareKey=1234abc")
                    )
                );
            SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project02);
            Assert.That(projectSecret.ShareKeys.Single(sk => sk.Key == "1234abc").ProjectRole, Is.EqualTo(role));
        }

        [Test]
        public async Task InviteAsync_SharingDisabled_ForbiddenError()
        {
            var env = new TestEnvironment();
            Assert.ThrowsAsync<ForbiddenException>(
                () =>
                    env.Service.InviteAsync(
                        User02,
                        Project01,
                        "newuser@example.com",
                        "en",
                        SFProjectRole.CommunityChecker
                    )
            );
            await env.EmailService.DidNotReceiveWithAnyArgs().SendEmailAsync(default, default, default);
        }

        [Test]
        public async Task InviteAsync_SpecificSharingEnabled_ProjectUserNotInvited()
        {
            var env = new TestEnvironment();
            const string email = "user02@example.com";
            const string role = SFProjectRole.CommunityChecker;
            SFProject project = env.GetProject(Project03);
            Assert.That(project.UserRoles.TryGetValue(User02, out string userRole), Is.True);
            Assert.That(userRole, Is.EqualTo(role), "setup - user should already be a project user");

            Assert.That(await env.Service.InviteAsync(User01, Project03, email, "en", role), Is.False);
            project = env.GetProject(Project03);
            Assert.That(project.UserRoles.ContainsKey(User02), Is.True, "user should still be a project user");

            SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);
            Assert.That(
                projectSecret.ShareKeys.Any(sk => sk.Email == email),
                Is.False,
                "no sharekey should have been added"
            );

            // Email should not have been sent
            await env.EmailService.DidNotReceiveWithAnyArgs().SendEmailAsync(null, default, default);
        }

        [Test]
        public void InviteAsync_UserNotOnProject_ForbiddenError()
        {
            var env = new TestEnvironment();
            const string email = "newuser@example.com";
            const string role = SFProjectRole.CommunityChecker;
            Assert.DoesNotThrowAsync(() => env.Service.InviteAsync(User02, Project03, email, "en", role));
            Assert.ThrowsAsync<ForbiddenException>(() => env.Service.InviteAsync(User03, Project03, email, "en", role));
        }

        [Test]
        public async Task GetLinkSharingKeyAsync_LinkDoesNotExist_NewShareKeyCreated()
        {
            var env = new TestEnvironment();
            await env.Service.UpdateSettingsAsync(
                User01,
                Project03,
                new SFProjectSettings { CheckingShareLevel = CheckingShareLevel.Anyone }
            );
            SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);
            Assert.That(projectSecret.ShareKeys.Any(sk => sk.Email == null), Is.False);
            env.SecurityService.GenerateKey().Returns("newkey");

            string shareLink = await env.Service.GetLinkSharingKeyAsync(
                User02,
                Project03,
                SFProjectRole.CommunityChecker
            );
            Assert.That(shareLink, Is.EqualTo("newkey"));
            projectSecret = env.ProjectSecrets.Get(Project03);
            Assert.That(
                projectSecret.ShareKeys.Single(sk => sk.Email == null && sk.ExpirationTime == null).Key,
                Is.EqualTo("newkey")
            );
        }

        [Test]
        public async Task GetLinkSharingKeyAsync_LinkExists_ReturnsExistingKey()
        {
            var env = new TestEnvironment();
            const string role = SFProjectRole.CommunityChecker;
            SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project02);

            Assert.That(
                projectSecret.ShareKeys.Any(sk => sk.Email == null && sk.ProjectRole == role),
                Is.True,
                "setup - a link sharing key should exist"
            );
            string shareLink = await env.Service.GetLinkSharingKeyAsync(User02, Project02, role);
            Assert.That(shareLink, Is.EqualTo("linksharing02"));
        }

        [Test]
        public async Task GetLinkSharingKeyAsync_LinkSharingDisabled_ForbiddenError()
        {
            var env = new TestEnvironment();
            SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project01);
            Assert.That(projectSecret.ShareKeys.Count, Is.EqualTo(0));
            string key = await env.Service.GetLinkSharingKeyAsync(User01, Project01, SFProjectRole.CommunityChecker);
            Assert.That(key, Is.Null);
            projectSecret = env.ProjectSecrets.Get(Project01);
            Assert.That(projectSecret.ShareKeys.Count, Is.EqualTo(0));
        }

        [Test]
        public void CheckLinkSharingAsync_LinkSharingDisabledAndUserOnProject_Success()
        {
            var env = new TestEnvironment();
            SFProject project = env.GetProject(Project01);
            Assert.That(project.UserRoles.ContainsKey(User02), Is.True, "setup");
            Assert.DoesNotThrowAsync(() => env.Service.CheckLinkSharingAsync(User02, Project01, "abcd"));
        }

        [Test]
        public async Task CheckLinkSharingAsync_LinkSharingDisabledAndUserNotOnProject_Forbidden()
        {
            var env = new TestEnvironment();
            SFProject project = env.GetProject(Project02);
            Assert.That(project.UserRoles.ContainsKey(User03), Is.False, "setup");
            await env.Service.UpdateSettingsAsync(
                User02,
                Project02,
                new SFProjectSettings { CheckingShareEnabled = false }
            );
            Assert.ThrowsAsync<ForbiddenException>(
                () => env.Service.CheckLinkSharingAsync(User03, Project02, "linksharing02")
            );
        }

        [Test]
        public async Task CheckLinkSharingAsync_LinkSharingEnabled_UserJoined()
        {
            var env = new TestEnvironment();
            SFProject project = env.GetProject(Project02);
            Assert.That(project.UserRoles.ContainsKey(User03), Is.False, "setup");

            await env.Service.CheckLinkSharingAsync(User03, Project02, "linksharing02");
            project = env.GetProject(Project02);
            Assert.That(project.UserRoles.TryGetValue(User03, out string userRole), Is.True);
            Assert.That(userRole, Is.EqualTo(SFProjectRole.CommunityChecker));
            User user = env.GetUser(User03);
            Assert.That(user.Sites[SiteId].Projects, Contains.Item(Project02));
        }

        [Test]
        public async Task CheckLinkSharingAsync_LinkSharingEnabledAndShareKeyExists_UserJoinedAndKeyRemoved()
        {
            var env = new TestEnvironment();
            SFProject project = env.GetProject(Project02);
            SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project02);

            Assert.That(project.UserRoles.ContainsKey(User03), Is.False, "setup");
            Assert.That(projectSecret.ShareKeys.Any(sk => sk.Key == "existingkeyuser03"), Is.True, "setup");

            await env.Service.CheckLinkSharingAsync(User03, Project02, "existingkeyuser03");
            project = env.GetProject(Project02);
            projectSecret = env.ProjectSecrets.Get(Project02);
            Assert.That(project.UserRoles.ContainsKey(User03), Is.True, "User should have been added to project");
            Assert.That(
                projectSecret.ShareKeys.Any(sk => sk.Key == "existingkeyuser03"),
                Is.False,
                "Key should have been removed from project"
            );
        }

        [Test]
        public async Task CheckLinkSharingAsync_SpecificSharingAlternateUser_UserJoined()
        {
            var env = new TestEnvironment();
            SFProject project = env.GetProject(Project03);
            SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);

            Assert.That(project.UserRoles.ContainsKey(User04), Is.False, "setup");
            var invitees = await env.Service.InvitedUsersAsync(User01, Project03);
            Assert.That(
                invitees.Select(i => i.Email),
                Is.EquivalentTo(
                    new[] { "bob@example.com", "expired@example.com", "user03@example.com", "bill@example.com" }
                ),
                "setup"
            );

            // Use the sharekey linked to user03
            await env.Service.CheckLinkSharingAsync(User04, Project03, "key1234");
            project = env.GetProject(Project03);
            projectSecret = env.ProjectSecrets.Get(Project03);
            Assert.That(project.UserRoles.ContainsKey(User04), Is.True, "User should have been added to project");
            Assert.That(
                projectSecret.ShareKeys.Any(sk => sk.Key == "key1234"),
                Is.False,
                "Key should have been removed from project"
            );

            invitees = await env.Service.InvitedUsersAsync(User01, Project03);
            Assert.That(
                invitees.Select(i => i.Email),
                Is.EquivalentTo(new[] { "bob@example.com", "expired@example.com", "bill@example.com" })
            );
        }

        [Test]
        public async Task CheckLinkSharingAsync_SpecificSharingLinkExpired_ForbiddenError()
        {
            var env = new TestEnvironment();
            SFProject project = env.GetProject(Project03);
            SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);

            Assert.That(project.UserRoles.ContainsKey(LinkExpiredUser), Is.False, "setup");
            Assert.That(projectSecret.ShareKeys.Any(sk => sk.Email == "expired@example.com"), Is.True, "setup");

            Assert.ThrowsAsync<ForbiddenException>(
                () => env.Service.CheckLinkSharingAsync(LinkExpiredUser, Project03, "keyexp"),
                "The user should be forbidden to join the project: Email was in ShareKeys, but code was expired."
            );

            var invitees = await env.Service.InvitedUsersAsync(User01, Project03);
            Assert.That(
                invitees.Select(i => i.Email),
                Is.EquivalentTo(
                    new[] { "bob@example.com", "expired@example.com", "user03@example.com", "bill@example.com" }
                )
            );
        }

        [Test]
        public void CheckLinkSharingAsync_SpecificSharingAndWrongCode_ForbiddenError()
        {
            var env = new TestEnvironment();
            SFProject project = env.GetProject(Project03);
            SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);

            Assert.That(project.UserRoles.ContainsKey(User03), Is.False, "setup");
            Assert.That(projectSecret.ShareKeys.Any(sk => sk.Email == "user03@example.com"), Is.True, "setup");

            Assert.ThrowsAsync<ForbiddenException>(
                () => env.Service.CheckLinkSharingAsync(User03, Project03, "badcode"),
                "The user should be forbidden to join the project: Email address was in ShareKeys list, but wrong code was given."
            );
        }

        [Test]
        public async Task CheckLinkSharingAsync_SpecificSharingAndRightKey_UserJoined()
        {
            var env = new TestEnvironment();
            SFProject project = env.GetProject(Project03);
            SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);

            Assert.That(project.UserRoles.ContainsKey(User03), Is.False, "setup");
            Assert.That(projectSecret.ShareKeys.Any(sk => sk.Key == "key1234"), Is.True, "setup");
            Assert.That(projectSecret.ShareKeys.Count, Is.EqualTo(4), "setup");

            await env.Service.CheckLinkSharingAsync(User03, Project03, "key1234");

            project = env.GetProject(Project03);
            projectSecret = env.ProjectSecrets.Get(Project03);
            Assert.That(project.UserRoles.ContainsKey(User03), Is.True, "User should have been added to project");
            Assert.That(
                projectSecret.ShareKeys.Any(sk => sk.Key == "key1234"),
                Is.False,
                "Key should have been removed from project"
            );
        }

        [Test]
        public async Task CheckLinkSharingAsync_ShareDisabledAndKeyValid_UserJoined()
        {
            var env = new TestEnvironment();
            SFProject project = env.GetProject(Project03);
            SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);

            Assert.That(project.UserRoles.ContainsKey(User03), Is.False, "setup");
            Assert.That(projectSecret.ShareKeys.Any(sk => sk.Key == "key1234"), Is.True, "setup");
            Assert.That(projectSecret.ShareKeys.Count, Is.EqualTo(4), "setup");

            await env.Service.UpdateSettingsAsync(
                User01,
                Project03,
                new SFProjectSettings { CheckingShareEnabled = false }
            );
            project = env.GetProject(Project03);
            Assert.That(project.CheckingConfig.ShareEnabled, Is.False, "setup");
            await env.Service.CheckLinkSharingAsync(User03, Project03, "key1234");

            project = env.GetProject(Project03);
            projectSecret = env.ProjectSecrets.Get(Project03);
            Assert.That(project.UserRoles.ContainsKey(User03), Is.True, "User should have been added to project");
            Assert.That(
                projectSecret.ShareKeys.Any(sk => sk.Key == "key1234"),
                Is.False,
                "Key should have been removed from project"
            );
        }

        [Test]
        public async Task CheckLinkSharingAsync_PTUserHasPTPermissions()
        {
            // If a user is invited to a project, and goes to the invitation link, the user being added to the project
            // should have their PT permissions for text books and chapters.

            var env = new TestEnvironment();
            string project05PTId = "paratext_" + Project05;
            SFProject project = env.GetProject(Project05);
            SFProject resource = env.GetProject(Resource01);

            Assert.That(env.UserSecrets.Contains(User03), Is.True, "setup. PT user should have user secrets.");
            User user = env.GetUser(User03);
            Assert.That(user.ParatextId, Is.Not.Null, "setup. PT user should have a PT User ID.");

            string userRoleOnPTProject = SFProjectRole.Translator;
            Assert.That(
                userRoleOnPTProject,
                Is.Not.EqualTo(SFProjectRole.CommunityChecker),
                "setup. role should be different than community checker for purposes of part of what this test is testing."
            );
            string shareKeyCode = "key12345";
            ShareKey shareKeyForUserInvitation = env.ProjectSecrets
                .Get(project.Id)
                .ShareKeys.First((ShareKey shareKey) => shareKey.Key == shareKeyCode);
            Assert.That(
                shareKeyForUserInvitation.ProjectRole,
                Is.EqualTo(SFProjectRole.CommunityChecker),
                "setup. the user should be being invited as a community checker."
            );
            env.ParatextService
                .TryGetProjectRoleAsync(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
                .Returns(Task.FromResult(Attempt.Success(userRoleOnPTProject)));
            string userDBLPermissionForResource = TextInfoPermission.Read;
            env.ParatextService
                .GetResourcePermissionAsync(Arg.Any<string>(), User03, Arg.Any<CancellationToken>())
                .Returns<Task<string>>(Task.FromResult(userDBLPermissionForResource));

            Assert.That(project.UserRoles.ContainsKey(User03), Is.False, "setup");
            Assert.That(project.Texts.First().Permissions.ContainsKey(User03), Is.False, "setup");
            Assert.That(project.Texts.First().Chapters.First().Permissions.ContainsKey(User03), Is.False, "setup");
            Assert.That(resource.UserRoles.ContainsKey(User03), Is.False, "setup");
            Assert.That(project.Texts.First().Permissions.ContainsKey(User03), Is.False, "setup");
            Assert.That(project.Texts.First().Chapters.First().Permissions.ContainsKey(User03), Is.False, "setup");

            var bookList = new List<int>() { 40, 41 };
            env.ParatextService.GetBookList(Arg.Any<UserSecret>(), Arg.Any<string>()).Returns(bookList);

            // PT will answer with these permissions.
            var ptBookPermissions = new Dictionary<string, string>()
            {
                { User03, TextInfoPermission.Read },
                { User01, TextInfoPermission.Read },
            };
            var ptChapterPermissions = new Dictionary<string, string>()
            {
                { User03, TextInfoPermission.Write },
                { User01, TextInfoPermission.Read },
            };
            var ptSourcePermissions = new Dictionary<string, string>()
            {
                { User03, userDBLPermissionForResource },
                { User01, TextInfoPermission.None },
            };
            const int bookValueToIndicateWholeResource = 0;
            const int chapterValueToIndicateWholeBook = 0;
            env.ParatextService
                .GetPermissionsAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Is<SFProject>((SFProject project) => project.ParatextId == project05PTId),
                    Arg.Any<IReadOnlyDictionary<string, string>>(),
                    Arg.Any<int>(),
                    chapterValueToIndicateWholeBook
                )
                .Returns(Task.FromResult(ptBookPermissions));
            env.ParatextService
                .GetPermissionsAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Is<SFProject>((SFProject project) => project.ParatextId == project05PTId),
                    Arg.Any<IReadOnlyDictionary<string, string>>(),
                    Arg.Any<int>(),
                    Arg.Is<int>((int arg) => arg > 0)
                )
                .Returns(Task.FromResult(ptChapterPermissions));
            env.ParatextService
                .GetPermissionsAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Is<SFProject>((SFProject project) => project.ParatextId == Resource01PTId),
                    Arg.Any<IReadOnlyDictionary<string, string>>(),
                    bookValueToIndicateWholeResource,
                    chapterValueToIndicateWholeBook
                )
                .Returns(Task.FromResult(ptSourcePermissions));

            // SUT
            await env.Service.CheckLinkSharingAsync(User03, Project05, shareKeyCode);

            project = env.GetProject(Project05);
            Assert.That(
                project.UserRoles.TryGetValue(User03, out string userRole),
                Is.True,
                "user should be added to project"
            );
            // This user was invited as a community checker (according to the share key). But their project role and
            // permissions will reflect what is set on the PT project. The user will have a translator role rather than
            // a community checker role.
            Assert.That(userRole, Is.EqualTo(userRoleOnPTProject));
            user = env.GetUser(User03);
            Assert.That(user.Sites[SiteId].Projects, Contains.Item(Project05));

            Assert.That(project.Texts.First().Permissions[User03], Is.EqualTo(TextInfoPermission.Read));
            Assert.That(
                project.Texts.First().Chapters.First().Permissions[User03],
                Is.EqualTo(TextInfoPermission.Write)
            );

            resource = env.GetProject(Resource01);
            Assert.That(
                resource.UserRoles.TryGetValue(User03, out string resourceUserRole),
                Is.True,
                "user should have been added to resource"
            );
            Assert.That(
                resourceUserRole,
                Is.EqualTo(SFProjectRole.PTObserver),
                "user role not set correctly on resource"
            );
            Assert.That(user.Sites[SiteId].Projects, Contains.Item(Resource01), "user not added to resource correctly");
            Assert.That(resource.Texts.First().Permissions[User03], Is.EqualTo(userDBLPermissionForResource));
            Assert.That(
                resource.Texts.First().Chapters.First().Permissions[User03],
                Is.EqualTo(userDBLPermissionForResource)
            );
        }

        [Test]
        public async Task CheckLinkSharingAsync_NonPTUser()
        {
            var env = new TestEnvironment();
            SFProject project = env.GetProject(Project05);

            Assert.That(
                env.UserSecrets.Contains(User04),
                Is.False,
                "setup. Non-PT user is not expected to have user secrets."
            );
            User user = env.GetUser(User04);
            Assert.That(user.ParatextId, Is.Null, "setup. Non-PT user should not have a PT User ID.");

            Assert.That(project.UserRoles.ContainsKey(User04), Is.False, "setup");
            Assert.That(project.Texts.First().Permissions.ContainsKey(User04), Is.False, "setup");
            Assert.That(project.Texts.First().Chapters.First().Permissions.ContainsKey(User04), Is.False, "setup");

            // SUT
            await env.Service.CheckLinkSharingAsync(User04, Project05, "key12345");

            project = env.GetProject(Project05);
            Assert.That(
                project.UserRoles.TryGetValue(User04, out string userRole),
                Is.True,
                "user was added to project"
            );
            Assert.That(userRole, Is.EqualTo(SFProjectRole.CommunityChecker));
            user = env.GetUser(User04);
            Assert.That(user.Sites[SiteId].Projects, Contains.Item(Project05));

            Assert.That(
                project.Texts.First().Permissions.ContainsKey(User04),
                Is.False,
                "no permissions should have been specified for user"
            );
            Assert.That(
                project.Texts.First().Chapters.First().Permissions.ContainsKey(User04),
                Is.False,
                "no permissions should have been specified for user"
            );

            // The get permission methods shouldn't have even been called.
            await env.ParatextService
                .DidNotReceiveWithAnyArgs()
                .GetPermissionsAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Any<SFProject>(),
                    Arg.Any<IReadOnlyDictionary<string, string>>(),
                    Arg.Any<int>(),
                    Arg.Any<int>()
                );
            await env.ParatextService
                .DidNotReceiveWithAnyArgs()
                .GetResourcePermissionAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>());
        }

        [Test]
        public async Task CheckLinkSharingAsync_PTUserButNotOfThisProjectAndCannotReadResource()
        {
            // The user joining the project _is_ a PT user, but they do not have a PT role on this particular project.
            // Further, they do not have permission to read the DBL resource.

            var env = new TestEnvironment();
            string project05PTId = "paratext_" + Project05;
            SFProject project = env.GetProject(Project05);
            SFProject resource = env.GetProject(Resource01);

            Assert.That(
                env.UserSecrets.Contains(User03),
                Is.True,
                "setup. This is a PT user and is expected to have user secrets."
            );
            User user = env.GetUser(User03);
            Assert.That(user.ParatextId, Is.Not.Null, "setup. PT user should have a PT User ID.");

            Assert.That(
                project.UserRoles.ContainsKey(User03),
                Is.False,
                "setup. User should not already be on the project."
            );
            Assert.That(
                project.Texts.First().Permissions.ContainsKey(User03),
                Is.False,
                "setup. User should not already have permissions on the project."
            );
            Assert.That(project.Texts.First().Chapters.First().Permissions.ContainsKey(User03), Is.False, "setup");
            Assert.That(
                resource.UserRoles.ContainsKey(User03),
                Is.False,
                "setup. User should not already be on the project."
            );
            Assert.That(
                resource.Texts.First().Permissions.ContainsKey(User03),
                Is.False,
                "setup. User should not have permissions."
            );
            Assert.That(resource.Texts.First().Chapters.First().Permissions.ContainsKey(User03), Is.False, "setup");

            // If the user is not a member of the paratext project, then
            // "GET https://registry-dev.paratext.org/api8/projects/PT_PROJECT_ID/members" will return a 404 Not Found,
            // and in ParatextService.CallApiAsync() there originates a System.Net.Http.HttpRequestException or perhaps
            // EdjCase.JsonRpc.Common.RpcException. Our test should not end up doing down a path that causes this
            // exception.
            env.ParatextService
                .GetParatextUsernameMappingAsync(
                    Arg.Is<UserSecret>((UserSecret userSecret) => userSecret.Id == User03),
                    Arg.Is((SFProject project) => project.ParatextId == project05PTId),
                    Arg.Any<CancellationToken>()
                )
                .Returns(
                    Task.FromException<IReadOnlyDictionary<string, string>>(new System.Net.Http.HttpRequestException())
                );

            string userRoleOnPTProject = (string)null;
            env.ParatextService
                .TryGetProjectRoleAsync(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
                .Returns(Task.FromResult(Attempt.Failure(userRoleOnPTProject)));
            string userDBLPermissionForResource = TextInfoPermission.None;
            env.ParatextService
                .GetResourcePermissionAsync(Arg.Any<string>(), User03, Arg.Any<CancellationToken>())
                .Returns<Task<string>>(Task.FromResult(userDBLPermissionForResource));

            env.ParatextService
                .GetBookList(Arg.Any<UserSecret>(), Arg.Any<string>())
                .Returns(x => throw new Exception("Probably can not do this."));

            // PT could answer with these permissions.
            var ptBookPermissions = new Dictionary<string, string>()
            {
                { User02, TextInfoPermission.Read },
                { User01, TextInfoPermission.Read },
            };
            var ptChapterPermissions = new Dictionary<string, string>()
            {
                { User02, TextInfoPermission.Write },
                { User01, TextInfoPermission.Read },
            };
            var ptSourcePermissions = new Dictionary<string, string>()
            {
                { User02, TextInfoPermission.Read },
                { User01, TextInfoPermission.Read },
            };
            const int bookValueToIndicateWholeResource = 0;
            const int chapterValueToIndicateWholeBook = 0;
            env.ParatextService
                .GetPermissionsAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Is<SFProject>((SFProject project) => project.ParatextId == project05PTId),
                    Arg.Any<IReadOnlyDictionary<string, string>>(),
                    Arg.Any<int>(),
                    chapterValueToIndicateWholeBook
                )
                .Returns(Task.FromResult(ptBookPermissions));
            env.ParatextService
                .GetPermissionsAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Is<SFProject>((SFProject project) => project.ParatextId == project05PTId),
                    Arg.Any<IReadOnlyDictionary<string, string>>(),
                    Arg.Any<int>(),
                    Arg.Is<int>((int arg) => arg > 0)
                )
                .Returns(Task.FromResult(ptChapterPermissions));
            env.ParatextService
                .GetPermissionsAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Is<SFProject>((SFProject project) => project.ParatextId == Resource01PTId),
                    Arg.Any<IReadOnlyDictionary<string, string>>(),
                    bookValueToIndicateWholeResource,
                    chapterValueToIndicateWholeBook
                )
                .Returns(Task.FromResult(ptSourcePermissions));

            // SUT
            await env.Service.CheckLinkSharingAsync(User03, Project05, "key12345");

            project = env.GetProject(Project05);
            Assert.That(
                project.UserRoles.TryGetValue(User03, out string userRole),
                Is.True,
                "user should have been added to project"
            );
            Assert.That(userRole, Is.EqualTo(SFProjectRole.CommunityChecker));
            user = env.GetUser(User03);
            Assert.That(user.Sites[SiteId].Projects, Contains.Item(Project05), "user not added to project correctly");

            Assert.That(
                project.Texts.First().Permissions.ContainsKey(User03),
                Is.False,
                "no project permissions should have been specified for user"
            );
            Assert.That(
                project.Texts.First().Chapters.First().Permissions.ContainsKey(User03),
                Is.False,
                "no project permissions should have been specified for user"
            );

            // User03 is not added to the target or source, nor do they have any permissions listed in the source.
            resource = env.GetProject(Resource01);
            Assert.That(
                resource.UserRoles.ContainsKey(User03),
                Is.False,
                "user should not have been added to resource project"
            );
            Assert.That(
                resource.Texts.First().Permissions.ContainsKey(User03),
                Is.False,
                "user should not have permissions to resource"
            );
            Assert.That(
                resource.Texts.First().Chapters.First().Permissions.ContainsKey(User03),
                Is.False,
                "user should not have permissions to resource"
            );
            Assert.That(
                user.Sites[SiteId].Projects,
                Does.Not.Contain(Resource01),
                "user should not have been added to"
            );

            // With the current implementation, both ParatextService.GetPermissionsAsync(for the source resource) and
            // ParatextService.GetPermissionsAsync(for the target project) should be called never. In a future change to
            // the SUT, it's okay if it is called, as long as the permissions don't get applied. But for now, not
            // getting called is a helpful indication of expected operation.
            // The mocks above regarding env.ParatextService.GetPermissionsAsync(for the target project) are left in
            // place in case they begin to be used.
            await env.ParatextService
                .DidNotReceive()
                .GetPermissionsAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Is<SFProject>((SFProject sfProject) => sfProject.Id == Project05),
                    Arg.Any<IReadOnlyDictionary<string, string>>(),
                    Arg.Any<int>(),
                    Arg.Any<int>()
                );
            await env.ParatextService
                .DidNotReceive()
                .GetPermissionsAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Is<SFProject>((SFProject sfProject) => sfProject.Id == Resource01),
                    Arg.Any<IReadOnlyDictionary<string, string>>(),
                    Arg.Any<int>(),
                    Arg.Any<int>()
                );

            // We may not be able to query a book list for the target project without the user having a PT project role,
            // or of the DBL resource, without the user having read permission.
            env.ParatextService.DidNotReceive().GetBookList(Arg.Any<UserSecret>(), project05PTId);
            env.ParatextService.DidNotReceive().GetBookList(Arg.Any<UserSecret>(), Resource01PTId);
        }

        [Test]
        public async Task CheckLinkSharingAsync_PTUserButNotOfThisProjectYetReadsResource()
        {
            // The user joining the project _is_ a PT user, but they do not have a PT role on this particular project.
            // Though they do have permission to read the DBL resource.

            var env = new TestEnvironment();
            string project05PTId = "paratext_" + Project05;
            SFProject project = env.GetProject(Project05);
            SFProject resource = env.GetProject(Resource01);

            Assert.That(
                env.UserSecrets.Contains(User03),
                Is.True,
                "setup. This is a PT user and is expected to have user secrets."
            );
            User user = env.GetUser(User03);
            Assert.That(user.ParatextId, Is.Not.Null, "setup. PT user should have a PT User ID.");

            Assert.That(
                project.UserRoles.ContainsKey(User03),
                Is.False,
                "setup. User should not already be on the project."
            );
            Assert.That(
                project.Texts.First().Permissions.ContainsKey(User03),
                Is.False,
                "setup. User should not already have permissions on the project."
            );
            Assert.That(project.Texts.First().Chapters.First().Permissions.ContainsKey(User03), Is.False, "setup");
            Assert.That(
                resource.UserRoles.ContainsKey(User03),
                Is.False,
                "setup. User should not already be on the project, for purposes of testing that they are later."
            );
            Assert.That(
                resource.Texts.First().Permissions.ContainsKey(User03),
                Is.False,
                "setup. User should not already have permissions."
            );
            Assert.That(resource.Texts.First().Chapters.First().Permissions.ContainsKey(User03), Is.False, "setup");

            env.ParatextService
                .GetParatextUsernameMappingAsync(
                    Arg.Is<UserSecret>((UserSecret userSecret) => userSecret.Id == User03),
                    Arg.Is((SFProject project) => project.ParatextId == project05PTId),
                    Arg.Any<CancellationToken>()
                )
                .Returns(
                    Task.FromException<IReadOnlyDictionary<string, string>>(new System.Net.Http.HttpRequestException())
                );

            string userRoleOnPTProject = (string)null;
            env.ParatextService
                .TryGetProjectRoleAsync(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
                .Returns(Task.FromResult(Attempt.Failure(userRoleOnPTProject)));
            string userDBLPermissionForResource = TextInfoPermission.Read;
            env.ParatextService
                .GetResourcePermissionAsync(Arg.Any<string>(), User03, Arg.Any<CancellationToken>())
                .Returns<Task<string>>(Task.FromResult(userDBLPermissionForResource));

            var bookList = new List<int>() { 40, 41 };
            env.ParatextService.GetBookList(Arg.Any<UserSecret>(), Arg.Any<string>()).Returns(bookList);

            // PT could answer with these permissions.
            var ptBookPermissions = new Dictionary<string, string>()
            {
                { User02, TextInfoPermission.Read },
                { User01, TextInfoPermission.Read },
            };
            var ptChapterPermissions = new Dictionary<string, string>()
            {
                { User02, TextInfoPermission.Write },
                { User01, TextInfoPermission.Read },
            };
            var ptSourcePermissions = new Dictionary<string, string>()
            {
                { User03, userDBLPermissionForResource },
                { User02, TextInfoPermission.Read },
                { User01, TextInfoPermission.Read },
            };
            const int bookValueToIndicateWholeResource = 0;
            const int chapterValueToIndicateWholeBook = 0;
            env.ParatextService
                .GetPermissionsAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Is<SFProject>((SFProject project) => project.ParatextId == project05PTId),
                    Arg.Any<IReadOnlyDictionary<string, string>>(),
                    Arg.Any<int>(),
                    chapterValueToIndicateWholeBook
                )
                .Returns(Task.FromResult(ptBookPermissions));
            env.ParatextService
                .GetPermissionsAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Is<SFProject>((SFProject project) => project.ParatextId == project05PTId),
                    Arg.Any<IReadOnlyDictionary<string, string>>(),
                    Arg.Any<int>(),
                    Arg.Is<int>((int arg) => arg > 0)
                )
                .Returns(Task.FromResult(ptChapterPermissions));
            env.ParatextService
                .GetPermissionsAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Is<SFProject>((SFProject project) => project.ParatextId == Resource01PTId),
                    Arg.Any<IReadOnlyDictionary<string, string>>(),
                    bookValueToIndicateWholeResource,
                    chapterValueToIndicateWholeBook
                )
                .Returns(Task.FromResult(ptSourcePermissions));

            // SUT
            await env.Service.CheckLinkSharingAsync(User03, Project05, "key12345");

            project = env.GetProject(Project05);
            Assert.That(
                project.UserRoles.TryGetValue(User03, out string userRole),
                Is.True,
                "user should have been added to project"
            );
            Assert.That(userRole, Is.EqualTo(SFProjectRole.CommunityChecker));
            user = env.GetUser(User03);
            Assert.That(user.Sites[SiteId].Projects, Contains.Item(Project05), "user not added to project correctly");

            Assert.That(
                project.Texts.First().Permissions.ContainsKey(User03),
                Is.False,
                "no project permissions should have been specified for user"
            );
            Assert.That(
                project.Texts.First().Chapters.First().Permissions.ContainsKey(User03),
                Is.False,
                "no project permissions should have been specified for user"
            );

            // User03 is not on project project05PTId, but they have access to the source resource. So
            // UpdatePermissionsAsync() should be inquiring about this and setting permissions as appropriate.
            await env.ParatextService
                .Received()
                .GetResourcePermissionAsync(Resource01PTId, User03, Arg.Any<CancellationToken>());
            resource = env.GetProject(Resource01);
            Assert.That(
                resource.Texts.First().Permissions[User03],
                Is.EqualTo(userDBLPermissionForResource),
                "resource permissions should have been set for joining project user"
            );
            Assert.That(
                resource.Texts.First().Chapters.First().Permissions[User03],
                Is.EqualTo(userDBLPermissionForResource),
                "resource permissions should have been set for joining project user"
            );
            Assert.That(
                resource.UserRoles.TryGetValue(User03, out string resourceUserRole),
                Is.True,
                "user should have been added to resource"
            );
            Assert.That(
                resourceUserRole,
                Is.EqualTo(SFProjectRole.PTObserver),
                "user role not set correctly on resource"
            );
            Assert.That(user.Sites[SiteId].Projects, Contains.Item(Resource01), "user not added to resource correctly");

            // With the current implementation, ParatextService.GetPermissionsAsync(for the source resource) should be
            // called once, but ParatextService.GetPermissionsAsync(for the target project) should be called never. In
            // a future change to the SUT, it's okay if it is called for the target project, as long as the permissions
            // don't get applied. But for now, not getting called is a helpful indication of expected operation.
            // The mocks above regarding env.ParatextService.GetPermissionsAsync(for the target project) are left in
            // place in case they begin to be used.
            await env.ParatextService
                .DidNotReceive()
                .GetPermissionsAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Is<SFProject>((SFProject sfProject) => sfProject.Id == Project05),
                    Arg.Any<IReadOnlyDictionary<string, string>>(),
                    Arg.Any<int>(),
                    Arg.Any<int>()
                );
            await env.ParatextService
                .Received(1)
                .GetPermissionsAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Is<SFProject>((SFProject sfProject) => sfProject.Id == Resource01),
                    Arg.Any<IReadOnlyDictionary<string, string>>(),
                    Arg.Any<int>(),
                    Arg.Any<int>()
                );

            // We may not be able to query a book list for the target project without the user having a PT project role.
            env.ParatextService.DidNotReceive().GetBookList(Arg.Any<UserSecret>(), project05PTId);
            env.ParatextService.Received(1).GetBookList(Arg.Any<UserSecret>(), Resource01PTId);
        }

        [Test]
        public void CheckLinkSharingAsync_ObserverInvitedToProject_AddedToProject()
        {
            var env = new TestEnvironment();
            SFProject project = env.GetProject(Project04);
            Assert.That(project.UserRoles.ContainsKey(User02), Is.False, "setup");

            Assert.DoesNotThrowAsync(() => env.Service.CheckLinkSharingAsync(User02, Project04, "linksharing04"));
            project = env.GetProject(Project04);
            Assert.That(project.UserRoles.ContainsKey(User02), Is.True, "user should be added to project");
        }

        [Test]
        public async Task IsAlreadyInvitedAsync_BadInput_False()
        {
            var env = new TestEnvironment();

            Assert.That(await env.Service.IsAlreadyInvitedAsync(User01, Project03, null), Is.False);

            Assert.That(await env.Service.IsAlreadyInvitedAsync(User01, Project03, ""), Is.False);

            Assert.That(await env.Service.IsAlreadyInvitedAsync(User01, Project03, "junk"), Is.False);

            Assert.That(await env.Service.IsAlreadyInvitedAsync(User02, Project02, "nothing"), Is.False);
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
            Assert.That(
                env.GetProject(Project03).UserRoles.GetValueOrDefault(User01, null),
                Is.EqualTo(SFProjectRole.Administrator)
            );
            Assert.That(await env.Service.IsAlreadyInvitedAsync(User01, Project03, "user01@example.com"), Is.False);
            Assert.That(
                env.GetProject(Project02).UserRoles.GetValueOrDefault(User04, null),
                Is.EqualTo(SFProjectRole.CommunityChecker)
            );
            Assert.That(await env.Service.IsAlreadyInvitedAsync(User04, Project02, "user01@example.com"), Is.False);
        }

        [Test]
        public async Task IsAlreadyInvitedAsync_NotInvitedOrOnProject_False()
        {
            var env = new TestEnvironment();

            Assert.That(await env.Service.IsAlreadyInvitedAsync(User01, Project03, "unheardof@example.com"), Is.False);
            Assert.That(await env.Service.IsAlreadyInvitedAsync(User04, Project02, "nobody@example.com"), Is.False);
        }

        [Test]
        public void IsAlreadyInvitedAsync_CheckingDisabledButCheckingSharingEnabled_Forbidden()
        {
            var env = new TestEnvironment();
            Assert.That(env.GetProject(Project06).CheckingConfig.CheckingEnabled, Is.False);
            Assert.That(env.GetProject(Project06).CheckingConfig.ShareEnabled, Is.True);
            Assert.That(
                env.GetProject(Project06).UserRoles.GetValueOrDefault(User01, null),
                Is.EqualTo(SFProjectRole.CommunityChecker)
            );

            Assert.ThrowsAsync<ForbiddenException>(
                () => env.Service.IsAlreadyInvitedAsync(User01, Project06, "user@example.com")
            );
        }

        [Test]
        public async Task IsAlreadyInvitedAsync_CheckingSharingDisabledTranslateSharingEnabled_False()
        {
            var env = new TestEnvironment();
            Assert.That(env.GetProject(Project04).CheckingConfig.ShareEnabled, Is.False);
            Assert.That(env.GetProject(Project04).TranslateConfig.ShareEnabled, Is.True);
            Assert.That(await env.Service.IsAlreadyInvitedAsync(User01, Project04, "user@example.com"), Is.False);
        }

        [Test]
        public void IsAlreadyInvitedAsync_InvitingUserNotOnProject_Forbidden()
        {
            var env = new TestEnvironment();
            Assert.That(env.GetProject(Project02).CheckingConfig.CheckingEnabled, Is.True);
            Assert.That(env.GetProject(Project02).CheckingConfig.ShareEnabled, Is.True);
            Assert.That(env.GetProject(Project02).UserRoles.GetValueOrDefault(User01, null), Is.Null);

            Assert.ThrowsAsync<ForbiddenException>(
                () => env.Service.IsAlreadyInvitedAsync(User01, Project02, "user@example.com")
            );
        }

        [Test]
        public async Task InvitedUsers_Reports()
        {
            var env = new TestEnvironment();
            // Project with no outstanding invitations
            Assert.That((await env.Service.InvitedUsersAsync(User01, Project01)).Count, Is.EqualTo(0));

            // Project with one specific shareKey and one link sharing shareKey record
            IReadOnlyList<InviteeStatus> invitees = await env.Service.InvitedUsersAsync(User02, Project02);
            Assert.That(invitees.Count, Is.EqualTo(1));
            Assert.That(invitees.Select(i => i.Email), Is.EquivalentTo(new string[] { "user03@example.com" }));

            // Project with several outstanding invitations
            invitees = await env.Service.InvitedUsersAsync(User01, Project03);
            Assert.That(invitees.Count, Is.EqualTo(4));
            string[] expectedEmailList =
            {
                "bob@example.com",
                "expired@example.com",
                "user03@example.com",
                "bill@example.com"
            };
            Assert.That(invitees.Select(i => i.Email), Is.EquivalentTo(expectedEmailList));
        }

        [Test]
        public void InvitedUsers_SystemAdmin_NoSpecialAccess()
        {
            var env = new TestEnvironment();

            // User04 is a system admin, but not a project-admin or even a user on Project03
            Assert.That(env.GetProject(Project03).UserRoles.ContainsKey(User04), Is.False, "test setup");
            Assert.That(env.GetUser(User04).Role, Is.EqualTo(SystemRole.SystemAdmin), "test setup");

            Assert.ThrowsAsync<ForbiddenException>(
                () => (env.Service.InvitedUsersAsync(User04, Project03)),
                "should have been forbidden"
            );
        }

        [Test]
        public void InvitedUsers_NonProjectAdmin_Forbidden()
        {
            var env = new TestEnvironment();
            // User02 is not an admin on Project01
            Assert.That(
                env.GetProject(Project01).UserRoles[User02],
                Is.Not.EqualTo(SFProjectRole.Administrator),
                "test setup"
            );
            Assert.That(env.GetUser(User02).Role, Is.Not.EqualTo(SystemRole.SystemAdmin), "test setup");
            Assert.ThrowsAsync<ForbiddenException>(
                () => env.Service.InvitedUsersAsync(User02, Project01),
                "should have been forbidden"
            );
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
            Assert.ThrowsAsync<DataNotFoundException>(
                () => env.Service.UninviteUserAsync(User02, "nonexistent-project", "some@email.com")
            );
        }

        [Test]
        public void UninviteUser_NonProjectAdmin_Error()
        {
            var env = new TestEnvironment();
            // User02 is not an admin on Project01
            Assert.That(
                env.GetProject(Project01).UserRoles[User02],
                Is.Not.EqualTo(SFProjectRole.Administrator),
                "test setup"
            );
            Assert.ThrowsAsync<ForbiddenException>(
                () => env.Service.UninviteUserAsync(User02, Project01, "some@email.com"),
                "should have been forbidden"
            );
        }

        [Test]
        public async Task UninviteUser_BadEmail_Ignored()
        {
            var env = new TestEnvironment();
            var initialInvitationCount = 4;
            Assert.That(
                (await env.ProjectSecrets.GetAsync(Project03)).ShareKeys.Count,
                Is.EqualTo(initialInvitationCount),
                "test setup"
            );

            await env.Service.UninviteUserAsync(User01, Project03, "unknown@email.com");
            Assert.That(
                (await env.ProjectSecrets.GetAsync(Project03)).ShareKeys.Count,
                Is.EqualTo(initialInvitationCount),
                "should not have changed"
            );
        }

        [Test]
        public async Task UninviteUser_RemovesInvitation()
        {
            var env = new TestEnvironment();
            var initialInvitationCount = 4;
            Assert.That(
                (await env.ProjectSecrets.GetAsync(Project03)).ShareKeys.Count,
                Is.EqualTo(initialInvitationCount),
                "test setup"
            );
            Assert.That(
                (await env.ProjectSecrets.GetAsync(Project03)).ShareKeys.Any(sk => sk.Email == "bob@example.com"),
                Is.True,
                "test setup"
            );
            Assert.That(
                (await env.ProjectSecrets.GetAsync(Project03)).ShareKeys.Count,
                Is.EqualTo(initialInvitationCount),
                "test setup"
            );

            await env.Service.UninviteUserAsync(User01, Project03, "bob@example.com");
            Assert.That(
                (await env.ProjectSecrets.GetAsync(Project03)).ShareKeys.Count,
                Is.EqualTo(initialInvitationCount - 1),
                "unexpected number of outstanding invitations"
            );
            Assert.That(
                (await env.ProjectSecrets.GetAsync(Project03)).ShareKeys.Any(sk => sk.Email == "bob@example.com"),
                Is.False,
                "should not still have uninvited email address"
            );
        }

        [Test]
        public void UninviteUser_SystemAdmin_NoSpecialAccess()
        {
            var env = new TestEnvironment();
            // User04 is a system admin, but not a project-admin or even a user on Project03
            Assert.That(env.GetProject(Project03).UserRoles.ContainsKey(User04), Is.False, "test setup");
            Assert.That(env.GetUser(User04).Role, Is.EqualTo(SystemRole.SystemAdmin), "test setup");

            Assert.ThrowsAsync<ForbiddenException>(
                () => env.Service.UninviteUserAsync(User04, Project03, "bob@example.com"),
                "should have been forbidden"
            );
        }

        [Test]
        public async Task AddUserAsync_ShareKeyExists_AddsUserAndRemovesKey()
        {
            var env = new TestEnvironment();
            SFProject project = env.GetProject(Project03);
            SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);

            Assert.That(project.UserRoles.ContainsKey(User03), Is.False, "setup");
            Assert.That(projectSecret.ShareKeys.Any(sk => sk.Key == "key1234"), Is.True, "setup");
            env.ParatextService
                .TryGetProjectRoleAsync(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
                .Returns(Task.FromResult(Attempt.Success(SFProjectRole.Translator)));

            await env.Service.AddUserAsync(User03, Project03, null);
            project = env.GetProject(Project03);
            projectSecret = env.ProjectSecrets.Get(Project03);
            Assert.That(project.UserRoles.ContainsKey(User03), Is.True, "User should have been added to project");
            Assert.That(
                projectSecret.ShareKeys.Any(sk => sk.Key == "key1234"),
                Is.False,
                "Key should have been removed from project"
            );
        }

        [Test]
        public void AddUserAsync_SourceProjectUnavailable_SkipProject()
        {
            var env = new TestEnvironment();
            Assert.DoesNotThrowAsync(() => env.Service.AddUserAsync(User01, Project04, SFProjectRole.Translator));
            var project = env.GetProject(Project04);
            Assert.That(project.UserRoles[User01], Is.EqualTo(SFProjectRole.Translator));
        }

        [Test]
        public async Task AddUserAsync_PTUserHasPTPermissions()
        {
            // If a user connects to an existing project from the Connect Project page, project text permissions should
            // be updated, so that the connecting user has permissions set that are from PT.

            var env = new TestEnvironment();
            string project05PTId = "paratext_" + Project05;
            SFProject project = env.GetProject(Project05);
            SFProject resource = env.GetProject(Resource01);

            Assert.That(env.UserSecrets.Contains(User03), Is.True, "setup. PT user should have user secrets.");
            User user = env.GetUser(User03);
            Assert.That(user.ParatextId, Is.Not.Null, "setup. PT user should have a PT User ID.");

            Assert.That(
                project.UserRoles.ContainsKey(User03),
                Is.False,
                "setup. User should not already be on the project."
            );
            Assert.That(
                project.Texts.First().Permissions.ContainsKey(User03),
                Is.False,
                "setup. User should not already have permissions on the project."
            );
            Assert.That(project.Texts.First().Chapters.First().Permissions.ContainsKey(User03), Is.False, "setup");
            Assert.That(
                resource.UserRoles.ContainsKey(User03),
                Is.False,
                "setup. User should not already be on the project, for purposes of testing that they are later."
            );
            Assert.That(
                resource.Texts.First().Permissions.ContainsKey(User03),
                Is.False,
                "setup. User should not already have permissions."
            );
            Assert.That(resource.Texts.First().Chapters.First().Permissions.ContainsKey(User03), Is.False, "setup");

            string userRoleOnPTProject = SFProjectRole.Translator;
            env.ParatextService
                .TryGetProjectRoleAsync(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
                .Returns(Task.FromResult(Attempt.Success(userRoleOnPTProject)));
            string userDBLPermissionForResource = TextInfoPermission.Read;
            env.ParatextService
                .GetResourcePermissionAsync(Arg.Any<string>(), User03, Arg.Any<CancellationToken>())
                .Returns<Task<string>>(Task.FromResult(userDBLPermissionForResource));

            var bookList = new List<int>() { 40, 41 };
            env.ParatextService.GetBookList(Arg.Any<UserSecret>(), Arg.Any<string>()).Returns(bookList);

            // PT will answer with these permissions.
            var ptBookPermissions = new Dictionary<string, string>()
            {
                { User03, TextInfoPermission.Read },
                { User01, TextInfoPermission.Read },
            };
            var ptChapterPermissions = new Dictionary<string, string>()
            {
                { User03, TextInfoPermission.Write },
                { User01, TextInfoPermission.Read },
            };
            var ptSourcePermissions = new Dictionary<string, string>()
            {
                { User03, TextInfoPermission.Read },
                { User01, TextInfoPermission.None },
            };
            const int bookValueToIndicateWholeResource = 0;
            const int chapterValueToIndicateWholeBook = 0;
            env.ParatextService
                .GetPermissionsAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Is<SFProject>((SFProject project) => project.ParatextId == project05PTId),
                    Arg.Any<IReadOnlyDictionary<string, string>>(),
                    Arg.Any<int>(),
                    chapterValueToIndicateWholeBook
                )
                .Returns(Task.FromResult(ptBookPermissions));
            env.ParatextService
                .GetPermissionsAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Is<SFProject>((SFProject project) => project.ParatextId == project05PTId),
                    Arg.Any<IReadOnlyDictionary<string, string>>(),
                    Arg.Any<int>(),
                    Arg.Is<int>((int arg) => arg > 0)
                )
                .Returns(Task.FromResult(ptChapterPermissions));
            env.ParatextService
                .GetPermissionsAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Is<SFProject>((SFProject project) => project.ParatextId == Resource01PTId),
                    Arg.Any<IReadOnlyDictionary<string, string>>(),
                    bookValueToIndicateWholeResource,
                    chapterValueToIndicateWholeBook
                )
                .Returns(Task.FromResult(ptSourcePermissions));

            string projectRoleSpecifiedFromConnectProjectPage = null;

            // SUT
            await env.Service.AddUserAsync(User03, Project05, projectRoleSpecifiedFromConnectProjectPage);

            project = env.GetProject(Project05);
            Assert.That(
                project.UserRoles.TryGetValue(User03, out string userRole),
                Is.True,
                "user should be added to project"
            );
            Assert.That(userRole, Is.EqualTo(userRoleOnPTProject));
            user = env.GetUser(User03);
            Assert.That(user.Sites[SiteId].Projects, Contains.Item(Project05));

            Assert.That(project.Texts.First().Permissions[User03], Is.EqualTo(TextInfoPermission.Read));
            Assert.That(
                project.Texts.First().Chapters.First().Permissions[User03],
                Is.EqualTo(TextInfoPermission.Write)
            );

            resource = env.GetProject(Resource01);
            Assert.That(resource.Texts.First().Permissions[User03], Is.EqualTo(userDBLPermissionForResource));
            Assert.That(
                resource.Texts.First().Chapters.First().Permissions[User03],
                Is.EqualTo(userDBLPermissionForResource)
            );
            Assert.That(
                resource.UserRoles.TryGetValue(User03, out string resourceUserRole),
                Is.True,
                "user should have been added to resource"
            );
            Assert.That(
                resourceUserRole,
                Is.EqualTo(SFProjectRole.PTObserver),
                "user role not set correctly on resource"
            );
            Assert.That(user.Sites[SiteId].Projects, Contains.Item(Resource01), "user not added to resource correctly");
        }

        [Test]
        public async Task AddUserAsync_HasSourceProjectRole_AddedToSourceProject()
        {
            var env = new TestEnvironment();
            SFProject project03 = env.GetProject(Project03);
            SFProject source = env.GetProject(SourceOnly);
            Assert.That(project03.UserRoles.ContainsKey(User03), Is.False, "setup");
            Assert.That(source.UserRoles.ContainsKey(User03), Is.False, "setup");
            User user = env.GetUser(User03);
            Assert.That(user.Sites[SiteId].Projects, Is.Empty);
            env.ParatextService
                .TryGetProjectRoleAsync(Arg.Any<UserSecret>(), "pt_source_no_suggestions", CancellationToken.None)
                .Returns(Task.FromResult(Attempt.Success(SFProjectRole.Translator)));

            await env.Service.AddUserAsync(User03, Project03, SFProjectRole.Translator);
            project03 = env.GetProject(Project03);
            source = env.GetProject(SourceOnly);
            Assert.That(project03.UserRoles.ContainsKey(User03));
            Assert.That(source.UserRoles.ContainsKey(User03));
            user = env.GetUser(User03);
            Assert.That(user.Sites[SiteId].Projects, Is.EquivalentTo(new[] { Project03, SourceOnly }));
        }

        [Test]
        public async Task UpdatePermissionsAsync_SkipsBookNotInDB()
        {
            // If a user connects a new project, and we seek to set permissions for the user before actually
            // synchronizing the Scripture text, then we are missing texts on which to set permissions when running
            // UpdatePermissionsAsync(). So silently ignore missing books.
            // It also is conceivable that a race could occur where (1) a book is added in Paratext and SendReceived
            // to the Paratext servers, (2) a SF user clicks Synchronize in SF, (3) SF RunAsync() gets as far as
            // running ParatextService.SendReceiveAsync(), but doesn't yet add the new book from PT into the SF DB.
            // (4) Another SF user joins the SF project, causing UpdatePermissionsAsync() to be called.
            // (5) UpdatePermissionsAsync() queries for ParatextService.GetBookList(), and then tries to find the
            // books (including the new book) in the SF project. (6) It doesn't find the new book in SF.
            // Silently ignoring this situation will prevent a crash from 6. And whether the new user will have
            // permissions for the new book and its chapters will depend on how smart ParatextSyncRunner's project doc
            // is.

            string project01PTId = "paratext_" + Project01;
            var env = new TestEnvironment();
            SFProject sfProject = env.GetProject(Project01);
            // The SF DB should only have 2 books
            Assert.That(sfProject.Texts.Count, Is.LessThan(3), "setup");

            // But PT reports that there are 3 books.
            env.ParatextService
                .GetBookList(Arg.Any<UserSecret>(), project01PTId)
                .Returns(new List<int>() { 40, 41, 42 });

            var ptBookPermissions = new Dictionary<string, string>()
            {
                { User01, TextInfoPermission.Read },
                { User02, TextInfoPermission.Write },
            };
            var ptChapterPermissions = new Dictionary<string, string>()
            {
                { User01, TextInfoPermission.Write },
                { User02, TextInfoPermission.Read },
            };
            const int chapterValueToIndicateWholeBook = 0;
            env.ParatextService
                .GetPermissionsAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Is<SFProject>((SFProject project) => project.ParatextId == project01PTId),
                    Arg.Any<IReadOnlyDictionary<string, string>>(),
                    Arg.Any<int>(),
                    chapterValueToIndicateWholeBook
                )
                .Returns(Task.FromResult(ptBookPermissions));
            env.ParatextService
                .GetPermissionsAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Is<SFProject>((SFProject project) => project.ParatextId == project01PTId),
                    Arg.Any<IReadOnlyDictionary<string, string>>(),
                    Arg.Any<int>(),
                    Arg.Is<int>((int arg) => arg > 0)
                )
                .Returns(Task.FromResult(ptChapterPermissions));

            sfProject = env.GetProject(Project01);
            Assert.That(sfProject.Texts.First().Permissions.Count, Is.EqualTo(0), "setup");
            Assert.That(sfProject.Texts.First().Chapters.First().Permissions.Count, Is.EqualTo(0), "setup");

            using IConnection conn = await env.RealtimeService.ConnectAsync(User01);
            IDocument<SFProject> project01Doc = await conn.FetchAsync<SFProject>(Project01);

            // SUT
            await env.Service.UpdatePermissionsAsync(User01, project01Doc, CancellationToken.None);

            // Permissions were set for the books and chapters that we were able to handle.
            sfProject = env.GetProject(Project01);
            Assert.That(sfProject.Texts.First().Permissions[User01], Is.EqualTo(TextInfoPermission.Read));
            Assert.That(sfProject.Texts.First().Permissions[User02], Is.EqualTo(TextInfoPermission.Write));
            Assert.That(
                sfProject.Texts.First().Chapters.First().Permissions[User01],
                Is.EqualTo(TextInfoPermission.Write)
            );
            Assert.That(
                sfProject.Texts.First().Chapters.First().Permissions[User02],
                Is.EqualTo(TextInfoPermission.Read)
            );

            // SF should still only have the 2 books.
            Assert.That(sfProject.Texts.Count, Is.LessThan(3), "surprise");
        }

        [Test]
        public async Task UpdatePermissionsAsync_ThrowsIfUserHasNoSecrets()
        {
            string project01PTId = "paratext_" + Project01;
            var env = new TestEnvironment();
            SFProject sfProject = env.GetProject(Project01);
            env.ParatextService.GetBookList(Arg.Any<UserSecret>(), project01PTId).Returns(new List<int>() { 40, 41 });
            Assert.That(env.ProjectSecrets.Contains(User04), Is.False, "setup");

            using IConnection conn = await env.RealtimeService.ConnectAsync(User04);
            IDocument<SFProject> project01Doc = await conn.FetchAsync<SFProject>(Project01);

            // SUT
            Assert.ThrowsAsync<DataNotFoundException>(
                () => env.Service.UpdatePermissionsAsync(User04, project01Doc, CancellationToken.None)
            );
        }

        [Test]
        public async Task UpdatePermissionsAsync_SetsBookAndChapterPermissions()
        {
            var env = new TestEnvironment();
            string project01PTId = "paratext_" + Project01;

            SFProject sfProject = env.GetProject(Project01);

            env.ParatextService.GetBookList(Arg.Any<UserSecret>(), project01PTId).Returns(new List<int>() { 40, 41 });

            var ptBookPermissions = new Dictionary<string, string>()
            {
                { User01, TextInfoPermission.Read },
                { User02, TextInfoPermission.Write },
            };
            var ptChapterPermissions = new Dictionary<string, string>()
            {
                { User01, TextInfoPermission.Write },
                { User02, TextInfoPermission.Read },
            };
            const int chapterValueToIndicateWholeBook = 0;
            env.ParatextService
                .GetPermissionsAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Is<SFProject>((SFProject project) => project.ParatextId == project01PTId),
                    Arg.Any<IReadOnlyDictionary<string, string>>(),
                    Arg.Any<int>(),
                    chapterValueToIndicateWholeBook
                )
                .Returns(Task.FromResult(ptBookPermissions));
            env.ParatextService
                .GetPermissionsAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Is<SFProject>((SFProject project) => project.ParatextId == project01PTId),
                    Arg.Any<IReadOnlyDictionary<string, string>>(),
                    Arg.Any<int>(),
                    Arg.Is<int>((int arg) => arg > 0)
                )
                .Returns(Task.FromResult(ptChapterPermissions));

            sfProject = env.GetProject(Project01);
            Assert.That(sfProject.Texts.First().Permissions.Count, Is.EqualTo(0), "setup");
            Assert.That(sfProject.Texts.First().Chapters.First().Permissions.Count, Is.EqualTo(0), "setup");

            using IConnection conn = await env.RealtimeService.ConnectAsync(User01);
            IDocument<SFProject> project01Doc = await conn.FetchAsync<SFProject>(Project01);

            // SUT
            await env.Service.UpdatePermissionsAsync(User01, project01Doc, CancellationToken.None);

            sfProject = env.GetProject(Project01);
            Assert.That(sfProject.Texts.First().Permissions[User01], Is.EqualTo(TextInfoPermission.Read));
            Assert.That(sfProject.Texts.First().Permissions[User02], Is.EqualTo(TextInfoPermission.Write));
            Assert.That(
                sfProject.Texts.First().Chapters.First().Permissions[User01],
                Is.EqualTo(TextInfoPermission.Write)
            );
            Assert.That(
                sfProject.Texts.First().Chapters.First().Permissions[User02],
                Is.EqualTo(TextInfoPermission.Read)
            );
        }

        [Test]
        public async Task UpdatePermissionsAsync_UserHasNoChapterPermission()
        {
            var env = new TestEnvironment();
            string project01PTId = "paratext_" + Project01;

            SFProject sfProject = env.GetProject(Project01);

            env.ParatextService.GetBookList(Arg.Any<UserSecret>(), project01PTId).Returns(new List<int>() { 40, 41 });

            var ptBookPermissions = new Dictionary<string, string>()
            {
                { User01, TextInfoPermission.Read },
                { User02, TextInfoPermission.None },
            };
            var ptChapterPermissions = new Dictionary<string, string>()
            {
                { User01, TextInfoPermission.Read },
                { User02, TextInfoPermission.None },
            };
            const int chapterValueToIndicateWholeBook = 0;
            env.ParatextService
                .GetPermissionsAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Is<SFProject>((SFProject project) => project.ParatextId == project01PTId),
                    Arg.Any<IReadOnlyDictionary<string, string>>(),
                    Arg.Any<int>(),
                    chapterValueToIndicateWholeBook
                )
                .Returns(Task.FromResult(ptBookPermissions));
            env.ParatextService
                .GetPermissionsAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Is<SFProject>((SFProject project) => project.ParatextId == project01PTId),
                    Arg.Any<IReadOnlyDictionary<string, string>>(),
                    Arg.Any<int>(),
                    Arg.Is<int>((int arg) => arg > 0)
                )
                .Returns(Task.FromResult(ptChapterPermissions));

            sfProject = env.GetProject(Project01);
            Assert.That(sfProject.Texts.First().Permissions.Count, Is.EqualTo(0), "setup");
            Assert.That(sfProject.Texts.First().Chapters.First().Permissions.Count, Is.EqualTo(0), "setup");

            using IConnection conn = await env.RealtimeService.ConnectAsync(User01);
            IDocument<SFProject> project01Doc = await conn.FetchAsync<SFProject>(Project01);

            // SUT
            await env.Service.UpdatePermissionsAsync(User01, project01Doc, CancellationToken.None);

            sfProject = env.GetProject(Project01);
            Assert.That(sfProject.Texts.First().Permissions[User01], Is.EqualTo(TextInfoPermission.Read));
            Assert.That(sfProject.Texts.First().Permissions[User02], Is.EqualTo(TextInfoPermission.None));
            Assert.That(
                sfProject.Texts.First().Chapters.First().Permissions[User01],
                Is.EqualTo(TextInfoPermission.Read)
            );
            Assert.That(
                sfProject.Texts.First().Chapters.First().Permissions[User02],
                Is.EqualTo(TextInfoPermission.None)
            );
        }

        [Test]
        public async Task UpdatePermissionsAsync_SetsResourcePermissions()
        {
            var env = new TestEnvironment();
            string project01PTId = "paratext_" + Project01;

            SFProject sfProject = env.GetProject(Project01);

            var bookList = new List<int>() { 40, 41 };
            env.ParatextService.GetBookList(Arg.Any<UserSecret>(), Arg.Any<string>()).Returns(bookList);

            var ptBookPermissions = new Dictionary<string, string>()
            {
                { User01, TextInfoPermission.Write },
                { User02, TextInfoPermission.Write },
            };
            var ptChapterPermissions = new Dictionary<string, string>()
            {
                { User01, TextInfoPermission.Write },
                { User02, TextInfoPermission.Write },
            };
            var ptSourcePermissions = new Dictionary<string, string>()
            {
                { User01, TextInfoPermission.Read },
                { User02, TextInfoPermission.None },
            };
            const int bookValueToIndicateWholeResource = 0;
            const int chapterValueToIndicateWholeBook = 0;
            env.ParatextService
                .GetPermissionsAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Is<SFProject>((SFProject project) => project.ParatextId == project01PTId),
                    Arg.Any<IReadOnlyDictionary<string, string>>(),
                    Arg.Any<int>(),
                    chapterValueToIndicateWholeBook
                )
                .Returns(Task.FromResult(ptBookPermissions));
            env.ParatextService
                .GetPermissionsAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Is<SFProject>((SFProject project) => project.ParatextId == project01PTId),
                    Arg.Any<IReadOnlyDictionary<string, string>>(),
                    Arg.Any<int>(),
                    Arg.Is<int>((int arg) => arg > 0)
                )
                .Returns(Task.FromResult(ptChapterPermissions));
            env.ParatextService
                .GetPermissionsAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Is<SFProject>((SFProject project) => project.ParatextId == Resource01PTId),
                    Arg.Any<IReadOnlyDictionary<string, string>>(),
                    bookValueToIndicateWholeResource,
                    chapterValueToIndicateWholeBook
                )
                .Returns(Task.FromResult(ptSourcePermissions));

            sfProject = env.GetProject(Project01);
            Assert.That(sfProject.Texts.First().Permissions.Count, Is.EqualTo(0), "setup");
            Assert.That(sfProject.Texts.First().Chapters.First().Permissions.Count, Is.EqualTo(0), "setup");

            SFProject resource = env.GetProject(Resource01);
            Assert.That(resource.Texts.First().Permissions.Count, Is.EqualTo(0), "setup");
            Assert.That(resource.Texts.First().Chapters.First().Permissions.Count, Is.EqualTo(0), "setup");

            using IConnection conn = await env.RealtimeService.ConnectAsync(User01);
            IDocument<SFProject> project01Doc = await conn.FetchAsync<SFProject>(Project01);
            IDocument<SFProject> resource01Doc = await conn.FetchAsync<SFProject>(Resource01);

            // SUT 1 - Setting target project permissions continues to work as expected.
            await env.Service.UpdatePermissionsAsync(User01, project01Doc, CancellationToken.None);
            // SUT 2 - Resource permissions are set.
            await env.Service.UpdatePermissionsAsync(User01, resource01Doc, CancellationToken.None);

            sfProject = env.GetProject(Project01);
            resource = env.GetProject(Resource01);
            Assert.That(sfProject.Texts.First().Permissions[User01], Is.EqualTo(TextInfoPermission.Write));
            Assert.That(sfProject.Texts.First().Permissions[User02], Is.EqualTo(TextInfoPermission.Write));
            Assert.That(
                sfProject.Texts.First().Chapters.First().Permissions[User01],
                Is.EqualTo(TextInfoPermission.Write)
            );
            Assert.That(
                sfProject.Texts.First().Chapters.First().Permissions[User02],
                Is.EqualTo(TextInfoPermission.Write)
            );
            Assert.That(resource.Texts.First().Permissions[User01], Is.EqualTo(TextInfoPermission.Read));
            Assert.That(resource.Texts.First().Permissions[User02], Is.EqualTo(TextInfoPermission.None));
            Assert.That(
                resource.Texts.First().Chapters.First().Permissions[User01],
                Is.EqualTo(TextInfoPermission.Read)
            );
            Assert.That(
                resource.Texts.First().Chapters.First().Permissions[User02],
                Is.EqualTo(TextInfoPermission.None)
            );
        }

        [Test]
        public void IsSourceProject_TrueWhenProjectIsATranslationSource()
        {
            var env = new TestEnvironment();
            Assert.That(env.Service.IsSourceProject(Resource01), Is.True);
            Assert.That(env.Service.IsSourceProject(Project01), Is.False);
            Assert.That(env.Service.IsSourceProject(SourceOnly), Is.True);
            Assert.That(env.Service.IsSourceProject("Bad project"), Is.False);
        }

        [Test]
        public async Task UpdateSettingsAsync_ChangeSourceProject_RecreateMachineProjectAndSync()
        {
            var env = new TestEnvironment();

            await env.Service.UpdateSettingsAsync(
                User01,
                Project01,
                new SFProjectSettings { SourceParatextId = "changedId", TranslationSuggestionsEnabled = true }
            );

            SFProject project = env.GetProject("project01");
            Assert.That(project.TranslateConfig.Source.ParatextId, Is.EqualTo("changedId"));
            Assert.That(project.TranslateConfig.Source.Name, Is.EqualTo("NewSource"));

            await env.EngineService.Received().RemoveProjectAsync(Arg.Any<string>());
            await env.EngineService.Received().AddProjectAsync(Arg.Any<MachineProject>());
            await env.SyncService.Received().SyncAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>());
        }

        [Test]
        public async Task UpdateSettingsAsync_SelectSourceProject_NoMachineProjectAndSync()
        {
            var env = new TestEnvironment();
            await env.Service.UpdateSettingsAsync(
                User02,
                Project02,
                new SFProjectSettings { SourceParatextId = "changedId" }
            );

            SFProject project = env.GetProject("project02");
            Assert.That(project.TranslateConfig.TranslationSuggestionsEnabled, Is.False);
            Assert.That(project.TranslateConfig.Source.ParatextId, Is.EqualTo("changedId"));
            Assert.That(project.TranslateConfig.Source.Name, Is.EqualTo("NewSource"));

            await env.EngineService.DidNotReceive().RemoveProjectAsync(Arg.Any<string>());
            await env.EngineService.DidNotReceive().AddProjectAsync(Arg.Any<MachineProject>());
            await env.SyncService.Received().SyncAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>());
        }

        [Test]
        public async Task UpdateSettingsAsync_EnableTranslate_CreateMachineProjectAndSync()
        {
            var env = new TestEnvironment();
            await env.Service.UpdateSettingsAsync(
                User01,
                Project03,
                new SFProjectSettings { TranslationSuggestionsEnabled = true }
            );

            SFProject project = env.GetProject(Project03);
            Assert.That(project.TranslateConfig.TranslationSuggestionsEnabled, Is.True);
            Assert.That(project.TranslateConfig.Source.Name, Is.EqualTo("Source Only Project"));

            await env.EngineService.DidNotReceive().RemoveProjectAsync(Arg.Any<string>());
            await env.EngineService.Received().AddProjectAsync(Arg.Any<Machine.WebApi.Models.Project>());
            await env.SyncService.Received().SyncAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>());
        }

        [Test]
        public async Task UpdateSettingsAsync_UnsetSourceProject_RemoveMachineProjectAndSync()
        {
            var env = new TestEnvironment();
            await env.Service.UpdateSettingsAsync(
                User01,
                Project01,
                new SFProjectSettings
                {
                    SourceParatextId = SFProjectService.ProjectSettingValueUnset,
                    TranslationSuggestionsEnabled = false
                }
            );

            SFProject project = env.GetProject(Project01);
            Assert.That(project.TranslateConfig.TranslationSuggestionsEnabled, Is.False);
            Assert.That(project.TranslateConfig.Source, Is.Null);

            await env.EngineService.Received().RemoveProjectAsync(Arg.Any<string>());
            await env.EngineService.DidNotReceive().AddProjectAsync(Arg.Any<MachineProject>());
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

            await env.Service.UpdateSettingsAsync(
                User01,
                Project01,
                new SFProjectSettings { CheckingShareEnabled = true }
            );

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
            Assert.That(env.ProjectSecrets.Contains(Project01), Is.True, "setup");
            // SUT
            await env.Service.DeleteProjectAsync(User01, Project01);

            Assert.That(env.ContainsProject(Project01), Is.False);
            User user = env.GetUser(User01);
            Assert.That(user.Sites[SiteId].Projects, Does.Not.Contain(Project01));
            await env.EngineService.Received().RemoveProjectAsync(Project01);
            env.FileSystemService.Received().DeleteDirectory(ptProjectDir);
            Assert.That(env.ProjectSecrets.Contains(Project01), Is.False);

            ptProjectDir = Path.Combine("xforge", "sync", "pt_source_no_suggestions");
            env.FileSystemService.DirectoryExists(ptProjectDir).Returns(true);
            Assert.That(env.GetProject(Project03).TranslateConfig.Source, Is.Not.Null);
            await env.Service.DeleteProjectAsync(User01, SourceOnly);

            await env.SyncService.Received().CancelSyncAsync(User01, SourceOnly);
            await env.EngineService.Received().RemoveProjectAsync(SourceOnly);
            env.FileSystemService.Received().DeleteDirectory(ptProjectDir);
            Assert.That(env.ContainsProject(SourceOnly), Is.False);
            Assert.That(env.GetUser(User01).Sites[SiteId].Projects, Does.Not.Contain(SourceOnly));
            Assert.That(env.GetProject(Project02).TranslateConfig.Source, Is.Null);
        }

        [Test]
        public async Task CreateProjectAsync_NotExisting_Created()
        {
            var env = new TestEnvironment();
            int projectCount = env.RealtimeService.GetRepository<SFProject>().Query().Count();
            env.ParatextService
                .TryGetProjectRoleAsync(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
                .Returns(Task.FromResult(Attempt.Success(SFProjectRole.Administrator)));
            // SUT
            string sfProjectId = await env.Service.CreateProjectAsync(
                User01,
                new SFProjectCreateSettings() { ParatextId = "ptProject123" }
            );
            Assert.That(env.ContainsProject(sfProjectId), Is.True);
            Assert.That(
                env.RealtimeService.GetRepository<SFProject>().Query().Count(),
                Is.EqualTo(projectCount + 1),
                "should have increased"
            );
            SFProject newProject = env.RealtimeService.GetRepository<SFProject>().Get(sfProjectId);
            Assert.That(newProject.CheckingConfig.ShareEnabled, Is.False, "Should default to not shared (SF-1142)");
        }

        [Test]
        public async Task CreateProjectAsync_Target_Created_Before_Source()
        {
            var env = new TestEnvironment();
            int projectCount = env.RealtimeService.GetRepository<SFProject>().Query().Count();
            env.ParatextService
                .TryGetProjectRoleAsync(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
                .Returns(Task.FromResult(Attempt.Success(SFProjectRole.Administrator)));
            env.ParatextService
                .GetResourcePermissionAsync(Arg.Any<string>(), User01, Arg.Any<CancellationToken>())
                .Returns(Task.FromResult(TextInfoPermission.Read));
            // SUT
            string sfProjectId = await env.Service.CreateProjectAsync(
                User01,
                new SFProjectCreateSettings()
                {
                    ParatextId = "ptProject123",
                    SourceParatextId = "resource_project",
                    TranslationSuggestionsEnabled = true,
                }
            );
            Assert.That(env.ContainsProject(sfProjectId), Is.True);
            Assert.That(
                env.RealtimeService.GetRepository<SFProject>().Query().Count(),
                Is.EqualTo(projectCount + 2),
                "should have increased"
            );

            // The source should have a later ID than the target in the project repository
            var projects = env.RealtimeService
                .GetRepository<SFProject>()
                .Query()
                .Where(p => p.ParatextId == "ptProject123" || p.ParatextId == "resource_project")
                .OrderBy(p => p.Id);
            Assert.That(projects.First().ParatextId, Is.EqualTo("ptProject123"), "target has the first id");
            Assert.That(projects.Last().ParatextId, Is.EqualTo("resource_project"), "source has the last id");

            // The source should appear after the target in the user's project array
            User user = env.GetUser(User01);
            Assert.That(
                user.Sites[SiteId].Projects.Skip(3).First(),
                Is.EqualTo(projects.First().Id),
                "target is first"
            );
            Assert.That(user.Sites[SiteId].Projects.Last(), Is.EqualTo(projects.Last().Id), "source is last");
        }

        [Test]
        public void CreateProjectAsync_AlreadyExists_Error()
        {
            var env = new TestEnvironment();
            int projectCount = env.RealtimeService.GetRepository<SFProject>().Query().Count();
            env.ParatextService
                .TryGetProjectRoleAsync(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
                .Returns(Task.FromResult(Attempt.Success(SFProjectRole.Administrator)));
            SFProject existingSfProject = env.GetProject(Project01);
            // SUT
            InvalidOperationException thrown = Assert.ThrowsAsync<InvalidOperationException>(
                () =>
                    env.Service.CreateProjectAsync(
                        User01,
                        new SFProjectCreateSettings() { ParatextId = existingSfProject.ParatextId }
                    )
            );
            Assert.That(thrown.Message, Does.Contain(SFProjectService.ErrorAlreadyConnectedKey));
            Assert.That(
                env.RealtimeService.GetRepository<SFProject>().Query().Count(),
                Is.EqualTo(projectCount),
                "should not have changed"
            );
        }

        [Test]
        public async Task CreateProjectAsync_RequestingPTUserHasPTPermissions()
        {
            // If a user connects a project that was not yet in SF via the Connect Project page, project text
            // permissions should be set so that the connecting user has permissions set that are from PT.

            var env = new TestEnvironment();
            string targetProjectPTId = PTProjectIdNotYetInSF;
            string sourceProjectPTId = Resource01PTId;
            SFProject resource = env.GetProject(Resource01);

            Assert.That(env.UserSecrets.Contains(User03), Is.True, "setup. PT user should have user secrets.");
            User user = env.GetUser(User03);
            Assert.That(user.ParatextId, Is.Not.Null, "setup. PT user should have a PT User ID.");
            Assert.That(env.ContainsProject(targetProjectPTId), Is.False, "setup. No such SF should exist yet.");

            Assert.That(
                resource.UserRoles.ContainsKey(User03),
                Is.False,
                "setup. User should not already be on the project, for purposes of testing that they are later."
            );
            Assert.That(resource.Texts.First().Permissions.ContainsKey(User03), Is.False, "setup");
            Assert.That(resource.Texts.First().Chapters.First().Permissions.ContainsKey(User03), Is.False, "setup");

            string userRoleOnPTProject = SFProjectRole.Administrator;
            env.ParatextService
                .TryGetProjectRoleAsync(Arg.Any<UserSecret>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
                .Returns(Task.FromResult(Attempt.Success(userRoleOnPTProject)));
            string userDBLPermissionForResource = TextInfoPermission.Read;
            env.ParatextService
                .GetResourcePermissionAsync(Arg.Any<string>(), User03, Arg.Any<CancellationToken>())
                .Returns<Task<string>>(Task.FromResult(userDBLPermissionForResource));

            var bookList = new List<int>() { 40, 41 };
            env.ParatextService.GetBookList(Arg.Any<UserSecret>(), Arg.Any<string>()).Returns(bookList);

            // PT will answer with these permissions.
            // Note that in the case of checking permissions for the target project, SF won't actually get to the
            // point where it queries for the PT permissions. But leaving these settings here in case
            // UpdatePermissionsAsync() is later modified and it starts doing that.
            var ptBookPermissions = new Dictionary<string, string>()
            {
                { User03, TextInfoPermission.Read },
                { User01, TextInfoPermission.Read },
            };
            var ptChapterPermissions = new Dictionary<string, string>()
            {
                { User03, TextInfoPermission.Write },
                { User01, TextInfoPermission.Read },
            };
            var ptSourcePermissions = new Dictionary<string, string>()
            {
                { User03, userDBLPermissionForResource },
                { User01, TextInfoPermission.None },
            };
            const int bookValueToIndicateWholeResource = 0;
            const int chapterValueToIndicateWholeBook = 0;
            env.ParatextService
                .GetPermissionsAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Is<SFProject>((SFProject project) => project.ParatextId == targetProjectPTId),
                    Arg.Any<IReadOnlyDictionary<string, string>>(),
                    Arg.Any<int>(),
                    chapterValueToIndicateWholeBook
                )
                .Returns(Task.FromResult(ptBookPermissions));
            env.ParatextService
                .GetPermissionsAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Is<SFProject>((SFProject project) => project.ParatextId == targetProjectPTId),
                    Arg.Any<IReadOnlyDictionary<string, string>>(),
                    Arg.Any<int>(),
                    Arg.Is<int>((int arg) => arg > 0)
                )
                .Returns(Task.FromResult(ptChapterPermissions));
            env.ParatextService
                .GetPermissionsAsync(
                    Arg.Any<UserSecret>(),
                    Arg.Is<SFProject>((SFProject project) => project.ParatextId == sourceProjectPTId),
                    Arg.Any<IReadOnlyDictionary<string, string>>(),
                    bookValueToIndicateWholeResource,
                    chapterValueToIndicateWholeBook
                )
                .Returns(Task.FromResult(ptSourcePermissions));

            resource = env.GetProject(Resource01);
            Assert.That(
                resource.Texts.First().Permissions.Count,
                Is.EqualTo(0),
                "setup. User should not have permissions on resource yet."
            );
            Assert.That(resource.Texts.First().Chapters.First().Permissions.Count, Is.EqualTo(0), "setup");

            // SUT
            string sfProjectId = await env.Service.CreateProjectAsync(
                User03,
                new SFProjectCreateSettings()
                {
                    ParatextId = targetProjectPTId,
                    SourceParatextId = sourceProjectPTId,
                    TranslationSuggestionsEnabled = true,
                }
            );

            SFProject project = env.GetProject(sfProjectId);
            Assert.That(
                project.UserRoles.TryGetValue(User03, out string userRole),
                Is.True,
                "user should be added to project"
            );
            Assert.That(userRole, Is.EqualTo(userRoleOnPTProject));
            user = env.GetUser(User03);
            Assert.That(user.Sites[SiteId].Projects, Contains.Item(sfProjectId), "user not added to project correctly");

            // Initially connecting a project should have called Sync, or SF is not going to fetch books and set
            // permissions on them.
            await env.SyncService.Received().SyncAsync(User03, sfProjectId, Arg.Any<bool>());

            // Don't check that permissions were added to the target project, because we mock the Sync functionality.
            // But we can show that source resource permissions were set:

            resource = env.GetProject(Resource01);
            Assert.That(resource.Texts.First().Permissions[User03], Is.EqualTo(userDBLPermissionForResource));
            Assert.That(
                resource.Texts.First().Chapters.First().Permissions[User03],
                Is.EqualTo(userDBLPermissionForResource)
            );
            Assert.That(
                resource.UserRoles.TryGetValue(User03, out string resourceUserRole),
                Is.True,
                "user should have been added to resource"
            );
            Assert.That(
                resourceUserRole,
                Is.EqualTo(SFProjectRole.PTObserver),
                "user role not set correctly on resource"
            );
            Assert.That(user.Sites[SiteId].Projects, Contains.Item(Resource01), "user not added to resource correctly");
        }

        [Test]
        public async Task CreateResourceProjectAsync_NotExisting_Created()
        {
            var env = new TestEnvironment();
            int projectCount = env.RealtimeService.GetRepository<SFProject>().Query().Count();
            // SUT
            string sfProjectId = await env.Service.CreateResourceProjectAsync(User01, "resource_project");
            Assert.That(env.ContainsProject(sfProjectId), Is.True);
            Assert.That(
                env.RealtimeService.GetRepository<SFProject>().Query().Count(),
                Is.EqualTo(projectCount + 1),
                "should have increased"
            );
        }

        [Test]
        public void CreateResourceProjectAsync_AlreadyExists_Error()
        {
            var env = new TestEnvironment();
            int projectCount = env.RealtimeService.GetRepository<SFProject>().Query().Count();
            SFProject existingSfProject = env.GetProject(Resource01);
            // SUT
            InvalidOperationException thrown = Assert.ThrowsAsync<InvalidOperationException>(
                () => env.Service.CreateResourceProjectAsync(User01, existingSfProject.ParatextId)
            );
            Assert.That(thrown.Message, Does.Contain(SFProjectService.ErrorAlreadyConnectedKey));
            Assert.That(
                env.RealtimeService.GetRepository<SFProject>().Query().Count(),
                Is.EqualTo(projectCount),
                "should not have changed"
            );
        }

        [Test]
        public async Task AddUserToResourceProjectAsync_UserResourcePermission()
        {
            var env = new TestEnvironment();
            env.ParatextService
                .GetResourcePermissionAsync(Arg.Any<string>(), User01, Arg.Any<CancellationToken>())
                .Returns(Task.FromResult(TextInfoPermission.Read));

            User user = env.GetUser(User01);
            Assert.That(user.Sites[SiteId].Projects.Contains(Resource01), Is.False, "setup");

            await env.Service.AddUserAsync(User01, Resource01, null);

            user = env.GetUser(User01);
            Assert.That(user.Sites[SiteId].Projects.Contains(Resource01), Is.True, "User can access resource");
        }

        [Test]
        public void AddUserToResourceProjectAsync_UserResourceNoPermission()
        {
            var env = new TestEnvironment();
            env.ParatextService
                .GetResourcePermissionAsync(Arg.Any<string>(), User01, Arg.Any<CancellationToken>())
                .Returns(Task.FromResult(TextInfoPermission.None));

            User user = env.GetUser(User01);
            Assert.That(user.Sites[SiteId].Projects.Contains(Resource01), Is.False, "setup");

            Assert.ThrowsAsync<ForbiddenException>(() => env.Service.AddUserAsync(User01, Resource01, null));

            user = env.GetUser(User01);
            Assert.That(user.Sites[SiteId].Projects.Contains(Resource01), Is.False, "user cannot access resource");
        }

        [Test]
        public void CancelSyncAsync_AdministratorsCanCancelSync()
        {
            // Setup
            var env = new TestEnvironment();

            // SUT
            Assert.DoesNotThrowAsync(() => env.Service.CancelSyncAsync(User01, Project01));
        }

        [Test]
        public void CancelSyncAsync_TranslatorsCanCancelSync()
        {
            // Setup
            var env = new TestEnvironment();

            // SUT
            Assert.DoesNotThrowAsync(() => env.Service.CancelSyncAsync(User05, Project01));
        }

        [Test]
        public void CancelSyncAsync_ObserversCannotCancelSync()
        {
            // Setup
            var env = new TestEnvironment();

            // SUT
            Assert.ThrowsAsync<ForbiddenException>(() => env.Service.CancelSyncAsync(User02, Project01));
        }

        [Test]
        public void CancelSyncAsync_UsersNotInProjectCannotCancelSync()
        {
            // Setup
            var env = new TestEnvironment();

            // SUT
            Assert.ThrowsAsync<ForbiddenException>(() => env.Service.CancelSyncAsync(User03, Project01));
        }

        [Test]
        public void SyncAsync_AdministratorsCanSync()
        {
            // Setup
            var env = new TestEnvironment();

            // SUT
            Assert.DoesNotThrowAsync(() => env.Service.SyncAsync(User01, Project01));
        }

        [Test]
        public void SyncAsync_TranslatorsCanSync()
        {
            // Setup
            var env = new TestEnvironment();

            // SUT
            Assert.DoesNotThrowAsync(() => env.Service.SyncAsync(User05, Project01));
        }

        [Test]
        public void SyncAsync_ObserversCannotSync()
        {
            // Setup
            var env = new TestEnvironment();

            // SUT
            Assert.ThrowsAsync<ForbiddenException>(() => env.Service.SyncAsync(User02, Project01));
        }

        private class TestEnvironment
        {
            public TestEnvironment()
            {
                RealtimeService = new SFMemoryRealtimeService();
                RealtimeService.AddRepository(
                    "users",
                    OTType.Json0,
                    new MemoryRepository<User>(
                        new[]
                        {
                            new User
                            {
                                Id = User01,
                                Email = "user01@example.com",
                                ParatextId = "pt-user01",
                                Sites = new Dictionary<string, Site>
                                {
                                    {
                                        SiteId,
                                        new Site { Projects = { Project01, Project03, SourceOnly } }
                                    }
                                }
                            },
                            new User
                            {
                                Id = User02,
                                Email = "user02@example.com",
                                ParatextId = "pt-user02",
                                Sites = new Dictionary<string, Site>
                                {
                                    {
                                        SiteId,
                                        new Site { Projects = { Project01, Project02, Project03 } }
                                    }
                                }
                            },
                            new User
                            {
                                Id = User03,
                                Email = "user03@example.com",
                                ParatextId = "pt-user03",
                                Sites = new Dictionary<string, Site> { { SiteId, new Site() } }
                            },
                            new User
                            {
                                Id = User04,
                                Email = "user04@example.com",
                                Sites = new Dictionary<string, Site> { { SiteId, new Site() } },
                                Role = SystemRole.SystemAdmin
                            },
                            new User
                            {
                                Id = LinkExpiredUser,
                                Email = "expired@example.com",
                                Sites = new Dictionary<string, Site> { { SiteId, new Site() } }
                            },
                            new User
                            {
                                Id = User05,
                                Email = "user05@example.com",
                                ParatextId = "pt-user05",
                                Sites = new Dictionary<string, Site>
                                {
                                    {
                                        SiteId,
                                        new Site { Projects = { Project01 } }
                                    }
                                }
                            },
                        }
                    )
                );
                RealtimeService.AddRepository(
                    "sf_projects",
                    OTType.Json0,
                    new MemoryRepository<SFProject>(
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
                                        ProjectRef = Resource01,
                                        ParatextId = Resource01PTId,
                                        Name = "resource project",
                                        ShortName = "RES",
                                        WritingSystem = new WritingSystem { Tag = "qaa" }
                                    }
                                },
                                CheckingConfig = new CheckingConfig { CheckingEnabled = true, ShareEnabled = false },
                                UserRoles = new Dictionary<string, string>
                                {
                                    { User01, SFProjectRole.Administrator },
                                    { User02, SFProjectRole.CommunityChecker },
                                    { User05, SFProjectRole.Translator },
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
                                                LastVerse = 3,
                                                IsValid = true,
                                                Permissions = { }
                                            }
                                        }
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
                                                Permissions = { }
                                            },
                                            new Chapter
                                            {
                                                Number = 2,
                                                LastVerse = 3,
                                                IsValid = true,
                                                Permissions = { }
                                            }
                                        }
                                    }
                                }
                            },
                            new SFProject
                            {
                                Id = Project02,
                                Name = "project02",
                                ShortName = "P02",
                                ParatextId = "paratext_" + Project02,
                                CheckingConfig = new CheckingConfig
                                {
                                    CheckingEnabled = true,
                                    ShareEnabled = true,
                                    ShareLevel = CheckingShareLevel.Anyone
                                },
                                UserRoles =
                                {
                                    { User02, SFProjectRole.Administrator },
                                    { User04, SFProjectRole.CommunityChecker }
                                },
                            },
                            new SFProject
                            {
                                Id = Project03,
                                Name = "project03",
                                ShortName = "P03",
                                ParatextId = "paratext_" + Project03,
                                CheckingConfig = new CheckingConfig
                                {
                                    CheckingEnabled = true,
                                    ShareEnabled = true,
                                    ShareLevel = CheckingShareLevel.Specific
                                },
                                TranslateConfig =
                                {
                                    TranslationSuggestionsEnabled = false,
                                    Source = new TranslateSource
                                    {
                                        ProjectRef = SourceOnly,
                                        ParatextId = "pt_source_no_suggestions",
                                        Name = "Source Only Project"
                                    }
                                },
                                UserRoles =
                                {
                                    { User01, SFProjectRole.Administrator },
                                    { User02, SFProjectRole.CommunityChecker }
                                }
                            },
                            new SFProject
                            {
                                Id = Project04,
                                Name = "project04",
                                ParatextId = "paratext_" + Project04,
                                TranslateConfig = new TranslateConfig
                                {
                                    TranslationSuggestionsEnabled = true,
                                    Source = new TranslateSource { ProjectRef = "Invalid_Source", ParatextId = "P04" },
                                    ShareEnabled = true,
                                    ShareLevel = TranslateShareLevel.Anyone
                                },
                                UserRoles = { { User01, SFProjectRole.CommunityChecker } }
                            },
                            new SFProject
                            {
                                Id = Project05,
                                ParatextId = "paratext_" + Project05,
                                Name = "Project05",
                                ShortName = "P05",
                                TranslateConfig = new TranslateConfig
                                {
                                    TranslationSuggestionsEnabled = true,
                                    Source = new TranslateSource
                                    {
                                        ProjectRef = Resource01,
                                        ParatextId = Resource01PTId,
                                        Name = "resource project",
                                        ShortName = "RES",
                                        WritingSystem = new WritingSystem { Tag = "qaa" }
                                    }
                                },
                                CheckingConfig = new CheckingConfig { CheckingEnabled = true, ShareEnabled = false },
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
                                            new Chapter
                                            {
                                                Number = 1,
                                                LastVerse = 3,
                                                IsValid = true,
                                                Permissions = { }
                                            }
                                        }
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
                                                Permissions = { }
                                            },
                                            new Chapter
                                            {
                                                Number = 2,
                                                LastVerse = 3,
                                                IsValid = true,
                                                Permissions = { }
                                            }
                                        }
                                    }
                                }
                            },
                            new SFProject
                            {
                                Id = Project06,
                                Name = "project06",
                                ParatextId = "paratext_" + Project06,
                                CheckingConfig = new CheckingConfig
                                {
                                    CheckingEnabled = false,
                                    ShareEnabled = true,
                                    ShareLevel = TranslateShareLevel.Anyone
                                },
                                UserRoles = { { User01, SFProjectRole.CommunityChecker } }
                            },
                            new SFProject
                            {
                                Id = Resource01,
                                ParatextId = Resource01PTId,
                                Name = "resource project",
                                ShortName = "RES",
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
                                                LastVerse = 3,
                                                IsValid = true,
                                                Permissions = { }
                                            }
                                        }
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
                                                Permissions = { }
                                            },
                                            new Chapter
                                            {
                                                Number = 2,
                                                LastVerse = 3,
                                                IsValid = true,
                                                Permissions = { }
                                            }
                                        }
                                    }
                                }
                            },
                            new SFProject
                            {
                                Id = SourceOnly,
                                ParatextId = "pt_source_no_suggestions",
                                Name = "Source Only Project",
                                ShortName = "DSP",
                                UserRoles = { { User01, SFProjectRole.Administrator } }
                            }
                        }
                    )
                );
                RealtimeService.AddRepository(
                    "sf_project_user_configs",
                    OTType.Json0,
                    new MemoryRepository<SFProjectUserConfig>(
                        new[]
                        {
                            new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId(Project01, User01) },
                            new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId(Project01, User02) },
                            new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId(Project01, User05) },
                            new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId(Project02, User02) },
                            new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId(Project03, User01) },
                            new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId(Project03, User02) },
                            new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId(SourceOnly, User01) }
                        }
                    )
                );

                RealtimeService.AddRepository(
                    "paratext_note_threads",
                    OTType.Json0,
                    new MemoryRepository<NoteThread>(
                        new[]
                        {
                            new NoteThread
                            {
                                Id = "project01:thread01",
                                DataId = "thread01",
                                Notes = new List<Note>()
                                {
                                    new Note { DataId = "thread01:PT01", SyncUserRef = "PT01" },
                                    new Note { DataId = "thread01:PT01", SyncUserRef = "PT02" }
                                }
                            },
                            new NoteThread
                            {
                                Id = "project01:thread02",
                                DataId = "thread02",
                                Notes = new List<Note>()
                                {
                                    new Note { DataId = "thread02:PT01", SyncUserRef = "PT01" },
                                    new Note { DataId = "thread02:PT02", SyncUserRef = "PT02" }
                                }
                            },
                        }
                    )
                );
                var siteOptions = Substitute.For<IOptions<SiteOptions>>();
                siteOptions.Value.Returns(
                    new SiteOptions
                    {
                        Id = SiteId,
                        Name = "xForge",
                        Origin = new Uri("http://localhost"),
                        SiteDir = "xforge"
                    }
                );
                var audioService = Substitute.For<IAudioService>();
                EmailService = Substitute.For<IEmailService>();
                var currentTime = DateTime.Now;
                ProjectSecrets = new MemoryRepository<SFProjectSecret>(
                    new[]
                    {
                        new SFProjectSecret
                        {
                            Id = Project01,
                            ShareKeys = new List<ShareKey> { }
                        },
                        new SFProjectSecret
                        {
                            Id = Project02,
                            ShareKeys = new List<ShareKey>
                            {
                                new ShareKey { Key = "linksharing02", ProjectRole = SFProjectRole.CommunityChecker },
                                new ShareKey
                                {
                                    Email = "user03@example.com",
                                    Key = "existingkeyuser03",
                                    ExpirationTime = currentTime.AddDays(1),
                                    ProjectRole = SFProjectRole.CommunityChecker
                                }
                            }
                        },
                        new SFProjectSecret
                        {
                            Id = Project03,
                            ShareKeys = new List<ShareKey>
                            {
                                new ShareKey
                                {
                                    Email = "bob@example.com",
                                    Key = "key1111",
                                    ExpirationTime = currentTime.AddDays(1),
                                    ProjectRole = SFProjectRole.CommunityChecker
                                },
                                new ShareKey
                                {
                                    Email = "expired@example.com",
                                    Key = "keyexp",
                                    ExpirationTime = currentTime.AddDays(-1),
                                    ProjectRole = SFProjectRole.CommunityChecker,
                                },
                                new ShareKey
                                {
                                    Email = "user03@example.com",
                                    Key = "key1234",
                                    ExpirationTime = currentTime.AddDays(1),
                                    ProjectRole = SFProjectRole.CommunityChecker
                                },
                                new ShareKey
                                {
                                    Email = "bill@example.com",
                                    Key = "key2222",
                                    ExpirationTime = currentTime.AddDays(1),
                                    ProjectRole = SFProjectRole.CommunityChecker
                                }
                            }
                        },
                        new SFProjectSecret
                        {
                            Id = Project04,
                            ShareKeys = new List<ShareKey>
                            {
                                new ShareKey { Key = "linksharing04", ProjectRole = SFProjectRole.SFObserver },
                            }
                        },
                        new SFProjectSecret
                        {
                            Id = Project05,
                            ShareKeys = new List<ShareKey>
                            {
                                new ShareKey
                                {
                                    Email = "user03@example.com",
                                    Key = "key12345",
                                    ExpirationTime = currentTime.AddDays(1),
                                    ProjectRole = SFProjectRole.CommunityChecker
                                }
                            }
                        },
                    }
                );
                EngineService = Substitute.For<IEngineService>();
                SyncService = Substitute.For<ISyncService>();
                SyncService
                    .SyncAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>())
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
                    new ParatextProject { ParatextId = GetProject(Project01).ParatextId },
                    new ParatextProject { ParatextId = PTProjectIdNotYetInSF },
                    new ParatextProject { ParatextId = "ptProject123" }
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
                    new ParatextResource { ParatextId = GetProject(Resource01).ParatextId }
                };
                ParatextService.GetResourcesAsync(Arg.Any<string>()).Returns(ptResources);
                UserSecrets = new MemoryRepository<UserSecret>(
                    new[]
                    {
                        new UserSecret { Id = User01 },
                        new UserSecret { Id = User02 },
                        new UserSecret { Id = User03 }
                    }
                );
                var translateMetrics = new MemoryRepository<TranslateMetrics>();
                FileSystemService = Substitute.For<IFileSystemService>();
                var options = Options.Create(new LocalizationOptions { ResourcesPath = "Resources" });
                var factory = new ResourceManagerStringLocalizerFactory(options, NullLoggerFactory.Instance);
                Localizer = new StringLocalizer<SharedResource>(factory);
                SecurityService = Substitute.For<ISecurityService>();
                SecurityService.GenerateKey().Returns("1234abc");
                var transceleratorService = Substitute.For<ITransceleratorService>();

                ParatextService
                    .IsResource(Arg.Any<string>())
                    .Returns(
                        callInfo =>
                            callInfo.ArgAt<string>(0).Length == SFInstallableDblResource.ResourceIdentifierLength
                    );

                Service = new SFProjectService(
                    RealtimeService,
                    siteOptions,
                    audioService,
                    EmailService,
                    ProjectSecrets,
                    SecurityService,
                    FileSystemService,
                    EngineService,
                    SyncService,
                    ParatextService,
                    UserSecrets,
                    translateMetrics,
                    Localizer,
                    transceleratorService
                );
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
            public MemoryRepository<UserSecret> UserSecrets { get; }

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
