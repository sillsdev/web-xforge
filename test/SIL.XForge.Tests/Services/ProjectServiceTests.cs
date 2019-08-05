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
            const string encodedEmail = "newuser@example[dot]com";

            await env.Service.InviteAsync(User01, Project03, email);
            await env.EmailService.Received(1).SendEmailAsync(email, Arg.Any<string>(),
                Arg.Is<string>(body =>
                    body.Contains($"http://localhost/projects/{Project03}?sharing=true&shareKey=1234abc")
                    && body.Contains("link will only work for this email address")));

            // Code was recorded in database and email address was encoded in ShareKeys
            TestProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);
            Assert.That(projectSecret.ShareKeys[encodedEmail], Is.EqualTo("1234abc"));
        }

        [Test]
        public async Task Invite_SpecificSharingEnabled_UserInvitedTwiceButWithSameCode()
        {
            var env = new TestEnvironment();
            const string email = "newuser@example.com";
            const string encodedEmail = "newuser@example[dot]com";

            TestProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);
            Assert.That(projectSecret.ShareKeys.ContainsKey(email), Is.False, "setup");

            env.SecurityService.GenerateKey().Returns("1111", "3333");
            await env.Service.InviteAsync(User01, Project03, email);
            await env.EmailService.Received(1).SendEmailAsync(email, Arg.Any<string>(),
                Arg.Is<string>(body =>
                    body.Contains($"http://localhost/projects/{Project03}?sharing=true&shareKey=1111")));

            // Code was recorded in database
            projectSecret = env.ProjectSecrets.Get(Project03);
            Assert.That(projectSecret.ShareKeys.ContainsKey(encodedEmail), Is.True);

            await env.Service.InviteAsync(User01, Project03, email);
            // Invitation email was sent again, but with first code
            await env.EmailService.Received(2).SendEmailAsync(Arg.Is(email), Arg.Any<string>(),
                Arg.Is<string>(body =>
                    body.Contains($"http://localhost/projects/{Project03}?sharing=true&shareKey=1111")));

            projectSecret = env.ProjectSecrets.Get(Project03);
            Assert.That(projectSecret.ShareKeys[encodedEmail], Is.EqualTo("1111"), "Code should not have been changed");
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
            const string encodedEmail = "user01@example[dot]com";
            TestProject project = env.GetProject(Project03);
            Assert.That(project.UserRoles.ContainsKey(User01), Is.True,
                "setup - user should already be a project user");

            Assert.That(await env.Service.InviteAsync(User01, Project03, email), Is.False);
            project = env.GetProject(Project03);
            Assert.That(project.UserRoles.ContainsKey(User01), Is.True, "user should still be a project user");

            TestProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);
            Assert.That(projectSecret.ShareKeys.ContainsKey(encodedEmail), Is.False,
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
            Assert.That(projectSecret.ShareKeys.ContainsKey("user03@example.com"), Is.False, "setup");

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
            Assert.That(projectSecret.ShareKeys.ContainsKey("user02@example[dot]com"), Is.True, "setup");

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
            Assert.That(projectSecret.ShareKeys.ContainsValue("key1234"), Is.True, "setup");
            Assert.That(projectSecret.ShareKeys.Count, Is.EqualTo(3), "setup");

            await env.Service.CheckLinkSharingAsync(User02, Project03, "key1234");

            project = env.GetProject(Project03);
            projectSecret = env.ProjectSecrets.Get(Project03);
            Assert.That(project.UserRoles.ContainsKey(User02), Is.True, "User should have been added to project");
            Assert.That(projectSecret.ShareKeys.ContainsValue("key1234"), Is.False,
                "Code should have been removed from project");
        }

        [Test]
        public async Task IsAlreadyInvitedAsync_BadInput_False()
        {
            var env = new TestEnvironment();

            Assert.That(await env.Service.IsAlreadyInvitedAsync(User01, Project03, null), Is.False);

            Assert.That(await env.Service.IsAlreadyInvitedAsync(User01, Project03, ""), Is.False);

            Assert.That(await env.Service.IsAlreadyInvitedAsync(User01, Project03, "junk"), Is.False);
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
        }

        [Test]
        public async Task IsAlreadyInvitedAsync_NotInvitedOrOnProject_False()
        {
            var env = new TestEnvironment();

            Assert.That(await env.Service.IsAlreadyInvitedAsync(User01, Project03, "unheardof@example.com"), Is.False);
        }

        [Test]
        public void EncodeJsonName_RetainsNondots()
        {
            foreach (var input in new string[] { "abc", "ABCabc123-_~!@#$%^&",
                "bob@localhost", null, "", " " })
            {
                Assert.That(TestProjectService.EncodeJsonName(input),
                    Is.EqualTo(input));
            }
        }

        [Test]
        public void EncodeJsonName_ReplacesDots()
        {
            Assert.That(TestProjectService.EncodeJsonName("."),
                Is.EqualTo("[dot]"));
            Assert.That(TestProjectService.EncodeJsonName("a.a"),
                Is.EqualTo("a[dot]a"));
            Assert.That(TestProjectService
                .EncodeJsonName("bob.smith@my.example.com"),
                Is.EqualTo("bob[dot]smith@my[dot]example[dot]com"));
            Assert.That(TestProjectService
                .EncodeJsonName("\"bob..smith\"@example.com"),
                Is.EqualTo("\"bob[dot][dot]smith\"@example[dot]com"));
        }

        [Test]
        public void DecodeJsonName_NonspecialIsUnmodified()
        {
            foreach (var input in new string[] { "abc", "ABCabc123-_~!@#$%^&",
                "bob@localhost", null, "", " ", "a[dot", "dot]a", "a[ dot]a" })
            {
                Assert.That(TestProjectService.DecodeJsonName(input),
                    Is.EqualTo(input));
            }
        }

        [Test]
        public void DecodeJsonName_ReplacesToken()
        {
            Assert.That(TestProjectService.DecodeJsonName("[dot]"),
                Is.EqualTo("."));
            Assert.That(TestProjectService.DecodeJsonName("a[dot]a"),
                Is.EqualTo("a.a"));
            Assert.That(TestProjectService
                .DecodeJsonName("bob[dot]smith@my[dot]example[dot]com"),
                Is.EqualTo("bob.smith@my.example.com"));
            Assert.That(TestProjectService
                .DecodeJsonName("\"bob[dot][dot]smith\"@example[dot]com"),
                Is.EqualTo("\"bob..smith\"@example.com"));
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
                                { User01, TestProjectRoles.Administrator }
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
                    Origin = new Uri("http://localhost")
                });

                EmailService = Substitute.For<IEmailService>();

                ProjectSecrets = new MemoryRepository<TestProjectSecret>(new[]
                {
                    new TestProjectSecret { Id = Project01 },
                    new TestProjectSecret { Id = Project02 },
                    new TestProjectSecret
                    {
                        Id = Project03,
                        ShareKeys = new Dictionary<string, string>
                        {
                            { "bob@example[dot]com", "key1111" },
                            { "user02@example[dot]com", "key1234" },
                            { "bill@example[dot]com", "key2222" }
                        }
                    },
                });

                SecurityService = Substitute.For<ISecurityService>();
                SecurityService.GenerateKey().Returns("1234abc");

                Service = new TestProjectService(RealtimeService, siteOptions, EmailService, ProjectSecrets,
                    SecurityService);
            }

            public TestProjectService Service { get; }
            public MemoryRealtimeService RealtimeService { get; }
            public IEmailService EmailService { get; }
            public MemoryRepository<TestProjectSecret> ProjectSecrets { get; }
            public ISecurityService SecurityService { get; }

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
