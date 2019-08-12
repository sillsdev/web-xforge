using System.Linq;
using System.IO;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;

namespace SIL.XForge.Services
{
    [TestFixture]
    public class ProjectServiceTests
    {
        private const string Project01 = "project01";
        private const string Project02 = "project02";
        private const string Project03 = "project03";
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
            TestProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);
            Assert.That(projectSecret.ShareKeys.Single(sk => sk.Email == email).Key, Is.EqualTo("1234abc"));
        }

        [Test]
        public async Task Invite_SpecificSharingEnabled_UserInvitedTwiceButWithSameCode()
        {
            var env = new TestEnvironment();
            const string email = "newuser@example.com";

            TestProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);
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
            const string email = "newuser@example.com";
            await env.Service.InviteAsync(User01, Project02, email);
            await env.EmailService.Received(1).SendEmailAsync(email, Arg.Any<string>(),
                Arg.Is<string>(body => body.Contains($"http://localhost/projects/{Project02}?sharing=true")
                    && body.Contains("link can be shared with others")));
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
            TestProject project = env.GetProject(Project03);
            Assert.That(project.UserRoles.ContainsKey(User01), Is.True,
                "setup - user should already be a project user");

            Assert.That(await env.Service.InviteAsync(User01, Project03, email), Is.False);
            project = env.GetProject(Project03);
            Assert.That(project.UserRoles.ContainsKey(User01), Is.True, "user should still be a project user");

            TestProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);
            Assert.That(projectSecret.ShareKeys.Any(sk => sk.Email == email), Is.False,
                "no sharekey should have been added");

            // Email should not have been sent
            await env.EmailService.DidNotReceiveWithAnyArgs().SendEmailAsync(null, default, default);
        }

        [Test]
        public void CheckLinkSharingAsync_LinkSharingDisabled_ForbiddenError()
        {
            var env = new TestEnvironment();
            Assert.ThrowsAsync<ForbiddenException>(() => env.Service.CheckLinkSharingAsync(User02, Project01));
        }

        [Test]
        public async Task CheckLinkSharingAsync_LinkSharingEnabled_UserJoined()
        {
            var env = new TestEnvironment();
            TestProject project = env.GetProject(Project02);
            Assert.That(project.UserRoles.ContainsKey(User02), Is.False, "setup");

            await env.Service.CheckLinkSharingAsync(User02, Project02);
            project = env.GetProject(Project02);
            Assert.That(project.UserRoles.ContainsKey(User02), Is.True);
            User user = env.GetUser(User02);
            Assert.That(user.Sites[SiteId].Projects, Contains.Item(Project02));
        }

        [Test]
        public void CheckLinkSharingAsync_SpecificSharingUnexpectedEmail_ForbiddenError()
        {
            var env = new TestEnvironment();
            TestProject project = env.GetProject(Project03);
            TestProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);

            Assert.That(project.UserRoles.ContainsKey(User03), Is.False, "setup");
            Assert.That(projectSecret.ShareKeys.Any(sk => sk.Email == "user03@example.com"), Is.False, "setup");

            Assert.ThrowsAsync<ForbiddenException>(() => env.Service.CheckLinkSharingAsync(User03, Project03),
                "The user should be forbidden to join the project: Email address was not in ShareKeys list.");
        }

        [Test]
        public void CheckLinkSharingAsync_SpecificSharingAndWrongCode_ForbiddenError()
        {
            var env = new TestEnvironment();
            TestProject project = env.GetProject(Project03);
            TestProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);

            Assert.That(project.UserRoles.ContainsKey(User02), Is.False, "setup");
            Assert.That(projectSecret.ShareKeys.Any(sk => sk.Email == "user02@example.com"), Is.True, "setup");

            Assert.ThrowsAsync<ForbiddenException>(() => env.Service.CheckLinkSharingAsync(User02, Project03),
                "The user should be forbidden to join the project: Email address was in ShareKeys list, but wrong code was given.");
        }

        [Test]
        public async Task CheckLinkSharingAsync_SpecificSharingAndRightKey_UserJoined()
        {
            var env = new TestEnvironment();
            TestProject project = env.GetProject(Project03);
            TestProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);

            Assert.That(project.UserRoles.ContainsKey(User02), Is.False, "setup");
            Assert.That(projectSecret.ShareKeys.Any(sk => sk.Key == "key1234"), Is.True, "setup");
            Assert.That(projectSecret.ShareKeys.Count, Is.EqualTo(3), "setup");

            await env.Service.CheckLinkSharingAsync(User02, Project03, "key1234");

            project = env.GetProject(Project03);
            projectSecret = env.ProjectSecrets.Get(Project03);
            Assert.That(project.UserRoles.ContainsKey(User02), Is.True, "User should have been added to project");
            Assert.That(projectSecret.ShareKeys.Any(sk => sk.Key == "key1234"), Is.False,
                "Code should have been removed from project");
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

        [Test]
        public async Task SaveAudioAsync_NonMp3File_AudioConverted()
        {
            var env = new TestEnvironment();
            string filePath = Path.Combine("site", "audio", Project01, $"{User01}_answer01.mp3");
            env.FileSystemService.OpenFile(Arg.Any<string>(), FileMode.Create).Returns(new MemoryStream());
            env.FileSystemService.FileExists(filePath).Returns(true);

            var stream = new MemoryStream();
            Uri uri = await env.Service.SaveAudioAsync(User01, Project01, "answer01", ".wav", stream);
            Assert.That(uri.ToString().StartsWith("http://localhost/assets/audio/project01/user01_answer01.mp3?t="),
                Is.True);
            await env.AudioService.Received().ConvertToMp3Async(Arg.Any<string>(), filePath);
        }

        [Test]
        public async Task SaveAudioAsync_Mp3File_AudioSaved()
        {
            var env = new TestEnvironment();
            string filePath = Path.Combine("site", "audio", Project01, $"{User01}_answer01.mp3");
            env.FileSystemService.OpenFile(Arg.Any<string>(), FileMode.Create).Returns(new MemoryStream());
            env.FileSystemService.FileExists(filePath).Returns(true);

            var stream = new MemoryStream();
            Uri uri = await env.Service.SaveAudioAsync(User01, Project01, "answer01", ".mp3", stream);
            Assert.That(uri.ToString().StartsWith("http://localhost/assets/audio/project01/user01_answer01.mp3?t="),
                Is.True);
            env.FileSystemService.Received().OpenFile(filePath, FileMode.Create);
            await env.AudioService.DidNotReceive().ConvertToMp3Async(Arg.Any<string>(), filePath);
        }

        [Test]
        public async Task DeleteAudioAsync_NonAdminUser_FileDeleted()
        {
            var env = new TestEnvironment();
            string filePath = Path.Combine("site", "audio", Project01, $"{User02}_answer01.mp3");
            env.FileSystemService.FileExists(filePath).Returns(true);

            await env.Service.DeleteAudioAsync(User02, Project01, User02, "answer01");
            env.FileSystemService.Received().DeleteFile(filePath);
        }

        [Test]
        public async Task DeleteAudioAsync_AdminUser_FileDeleted()
        {
            var env = new TestEnvironment();
            string filePath = Path.Combine("site", "audio", Project01, $"{User02}_answer01.mp3");
            env.FileSystemService.FileExists(filePath).Returns(true);

            await env.Service.DeleteAudioAsync(User01, Project01, User02, "answer01");
            env.FileSystemService.Received().DeleteFile(filePath);
        }

        [Test]
        public void DeleteAudioAsync_NotOwner_ForbiddenError()
        {
            var env = new TestEnvironment();
            string filePath = Path.Combine("site", "audio", Project01, $"{User01}_answer01.mp3");
            env.FileSystemService.FileExists(filePath).Returns(true);

            Assert.ThrowsAsync<ForbiddenException>(() =>
                env.Service.DeleteAudioAsync(User02, Project01, User01, "answer01"));
        }

        [Test]
        public async Task InvitedUsers_Reports()
        {
            var env = new TestEnvironment();

            // Project with no outstanding invitations
            Assert.That((await env.Service.InvitedUsersAsync(User01, Project01)).Length, Is.EqualTo(0));

            // Project with several outstanding invitations
            var invitees = (await env.Service.InvitedUsersAsync(User01, Project03));
            Assert.That(invitees.Length, Is.EqualTo(3));
            // Returned email addresses should not be using the "[dot]" encoding.
            string[] expectedEmailList = { "bob@example.com", "user02@example.com", "bill@example.com" };
            foreach (var expectedEmail in expectedEmailList)
            {
                Assert.That(Array.Exists(invitees, invitee => invitee == expectedEmail));
            }
        }

        [Test]
        public async Task InvitedUsers_SystemAdmin_Reports()
        {
            var env = new TestEnvironment();

            // User04 is a system admin, but not a project-admin or even a user on Project03
            Assert.That(env.GetProject(Project03).UserRoles.ContainsKey(User04), Is.False, "test setup");
            Assert.That(env.GetUser(User04).Role, Is.EqualTo(SystemRoles.SystemAdmin), "test setup");

            var invitees = (await env.Service.InvitedUsersAsync(User04, Project03));
            Assert.That(invitees.Length, Is.EqualTo(3));
            string[] expectedEmailList = { "bob@example.com", "user02@example.com", "bill@example.com" };
            foreach (var expectedEmail in expectedEmailList)
            {
                Assert.That(Array.Exists(invitees, invitee => invitee == expectedEmail));
            }
        }

        [Test]
        public void InvitedUsers_NonProjectAdmin_Forbidden()
        {
            var env = new TestEnvironment();
            // User02 is not an admin on Project01
            Assert.That(env.GetProject(Project01).UserRoles[User02], Is.Not.EqualTo(TestProjectRoles.Administrator), "test setup");
            Assert.ThrowsAsync<ForbiddenException>(() => env.Service.InvitedUsersAsync(User02, Project01), "should have been forbidden");
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

            Assert.ThrowsAsync<DataNotFoundException>(() => env.Service.InvitedUsersAsync("bad-user-id", Project01));
        }


        [Test]
        public void UninviteUser_BadProject_Error()
        {
            var env = new TestEnvironment();
            Assert.ThrowsAsync<DataNotFoundException>(() => env.Service.UninviteUserAsync(User02, "nonexistent-project", "some@email.com"));
        }

        [Test]
        public void UninviteUser_NonAdmin_Error()
        {
            var env = new TestEnvironment();
            // User02 is not an admin on Project01
            Assert.That(env.GetProject(Project01).UserRoles[User02], Is.Not.EqualTo(TestProjectRoles.Administrator), "test setup");
            Assert.ThrowsAsync<ForbiddenException>(() => env.Service.UninviteUserAsync(User02, Project01, "some@email.com"), "should have been forbidden");
        }

        [Test]
        public async Task UninviteUser_BadEmail_Ignored()
        {
            var env = new TestEnvironment();
            var initialInvitationCount = 3;
            Assert.That((await env.ProjectSecrets.GetAsync(Project03)).ShareKeys.Count, Is.EqualTo(initialInvitationCount), "test setup");

            await env.Service.UninviteUserAsync(User01, Project03, "unknown@email.com");
            Assert.That((await env.ProjectSecrets.GetAsync(Project03)).ShareKeys.Count, Is.EqualTo(initialInvitationCount), "should not have changed");
        }

        [Test]
        public async Task UninviteUser_RemovesInvitation()
        {
            var env = new TestEnvironment();
            var initialInvitationCount = 3;
            Assert.That((await env.ProjectSecrets.GetAsync(Project03)).ShareKeys.Count, Is.EqualTo(initialInvitationCount), "test setup");
            Assert.That((await env.ProjectSecrets.GetAsync(Project03)).ShareKeys.Any(sk => sk.Email == "bob@example.com"), Is.True, "test setup");
            Assert.That((await env.ProjectSecrets.GetAsync(Project03)).ShareKeys.Count, Is.EqualTo(initialInvitationCount), "test setup");

            await env.Service.UninviteUserAsync(User01, Project03, "bob@example.com");
            Assert.That((await env.ProjectSecrets.GetAsync(Project03)).ShareKeys.Count, Is.EqualTo(initialInvitationCount - 1), "unexpected number of outstanding invitations");
            Assert.That((await env.ProjectSecrets.GetAsync(Project03)).ShareKeys.Any(sk => sk.Email == "bob@example.com"), Is.False, "should not still have uninvited email address");
        }

        private class TestEnvironment
        {
            public TestEnvironment(bool isResetLinkExpired = false)
            {
                RealtimeService = new MemoryRealtimeService();
                RealtimeService.AddRepository(RootDataTypes.Users, OTType.Json0,
                    new MemoryRepository<User>(new[]
                    {
                        new User
                        {
                            Id = User01,
                            Email = "user01@example.com",
                            Sites = new Dictionary<string, Site> { { SiteId, new Site() } }
                        },
                        new User
                        {
                            Id = User02,
                            Email = "user02@example.com",
                            Sites = new Dictionary<string, Site> { { SiteId, new Site() } }
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
                            Role = SystemRoles.SystemAdmin
                        }
                    }));
                RealtimeService.AddRepository(RootDataTypes.Projects, OTType.Json0,
                    new MemoryRepository<TestProject>(new[]
                    {
                        new TestProject
                        {
                            Id = Project01,
                            ProjectName = "Project 1",
                            ShareEnabled = false,
                            UserRoles =
                            {
                                { User01, TestProjectRoles.Administrator },
                                { User02, TestProjectRoles.Reviewer }
                            }
                        },
                        new TestProject
                        {
                            Id = Project02,
                            ProjectName = "Project 2",
                            ShareEnabled = true,
                            ShareLevel = SharingLevel.Anyone,
                            UserRoles =
                            {
                                { User01, TestProjectRoles.Administrator },
                                { User03, TestProjectRoles.Reviewer }
                            }
                        },
                        new TestProject
                        {
                            Id = Project03,
                            ProjectName = "Project 3",
                            ShareEnabled = true,
                            ShareLevel = SharingLevel.Specific,
                            UserRoles =
                            {
                                { User01, TestProjectRoles.Administrator }
                            }
                        }
                    }));

                var siteOptions = Substitute.For<IOptions<SiteOptions>>();
                siteOptions.Value.Returns(new SiteOptions
                {
                    Id = SiteId,
                    Name = "xForge",
                    Origin = new Uri("http://localhost"),
                    SiteDir = "site"
                });
                AudioService = Substitute.For<IAudioService>();

                EmailService = Substitute.For<IEmailService>();

                ProjectSecrets = new MemoryRepository<TestProjectSecret>(new[]
                {
                    new TestProjectSecret { Id = Project01 },
                    new TestProjectSecret { Id = Project02 },
                    new TestProjectSecret
                    {
                        Id = Project03,
                        ShareKeys = new List<ShareKey>
                        {
                            new ShareKey { Email = "bob@example.com", Key = "key1111" },
                            new ShareKey { Email = "user02@example.com", Key = "key1234" },
                            new ShareKey { Email = "bill@example.com", Key = "key2222" }
                        }
                    },
                });

                SecurityService = Substitute.For<ISecurityService>();
                SecurityService.GenerateKey().Returns("1234abc");

                FileSystemService = Substitute.For<IFileSystemService>();

                Service = new TestProjectService(RealtimeService, siteOptions, AudioService, EmailService,
                    ProjectSecrets, SecurityService, FileSystemService);
            }

            public TestProjectService Service { get; }
            public MemoryRealtimeService RealtimeService { get; }
            public IEmailService EmailService { get; }
            public MemoryRepository<TestProjectSecret> ProjectSecrets { get; }
            public ISecurityService SecurityService { get; }
            public IFileSystemService FileSystemService { get; }
            public IAudioService AudioService { get; }

            public TestProject GetProject(string id)
            {
                return RealtimeService.GetRepository<TestProject>().Get(id);
            }

            public User GetUser(string id)
            {
                return RealtimeService.GetRepository<User>().Get(id);
            }
        }
    }
}


// TODO if a non-admin user tries to show the users page, just omit the invitees, don't crash.
