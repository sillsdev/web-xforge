using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using NSubstitute;
using NUnit.Framework;
using EdjCase.JsonRpc.Core;
using EdjCase.JsonRpc.Router.Defaults;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Services;
using SIL.XForge.Utils;

namespace SIL.XForge.Controllers
{
    [TestFixture]
    public class ProjectsRpcControllerTests
    {
        private const string Project01 = "project01";
        private const string Project02 = "project02";
        private const string Project03 = "project03";
        private const string User01 = "user01";
        private const string User02 = "user02";
        private const string User03 = "user03";

        [Test]
        public async Task Invite_ProjectAdminSharingDisabled_UserInvited()
        {
            var env = new TestEnvironment();
            env.SetUser(User01, SystemRoles.User);
            env.SetProject(Project01);
            const string email = "newuser@example.com";
            RpcMethodSuccessResult result = await env.Controller.Invite(email) as RpcMethodSuccessResult;
            Assert.That(result, Is.Not.Null);
            await env.EmailService.Received().SendEmailAsync(Arg.Is(email), Arg.Any<string>(),
                Arg.Is<string>(body => body.Contains($"http://localhost/projects/{Project01}?sharing=true&shareKey=1234abc")
                && body.Contains("link will only work for this email address")));
        }

        [Test]
        public async Task Invite_SpecificSharingEnabled_UserInvited()
        {
            var env = new TestEnvironment();
            env.SetUser(User01, SystemRoles.User);
            env.SetProject(Project03);
            const string email = "newuser@example.com";
            RpcMethodSuccessResult result = await env.Controller.Invite(email) as RpcMethodSuccessResult;
            Assert.That(result, Is.Not.Null);
            await env.EmailService.Received().SendEmailAsync(Arg.Is(email), Arg.Any<string>(),
                Arg.Is<string>(body => body.Contains($"http://localhost/projects/{Project03}?sharing=true&shareKey=1234abc")
                && body.Contains("link will only work for this email address")));

            // Code was recorded in database
            var project = env.Projects.Get(Project03);
            Assert.That(project.ShareKeys.ContainsValue("1234abc"));
            Assert.That(project.ShareKeys[email], Is.EqualTo("1234abc"));
        }

        [Test]
        public async Task Invite_SpecificSharingEnabled_UserInvitedTwiceButWithSameCode()
        {
            var env = new TestEnvironment();
            env.SetUser(User01, SystemRoles.User);
            env.SetProject(Project03);
            const string email = "newuser@example.com";

            var project = env.Projects.Get(Project03);
            Assert.That(project.ShareKeys.ContainsKey(email), Is.False, "setup");

            env.SecurityUtils.GenerateKey().Returns("1111", "3333");
            RpcMethodSuccessResult result = await env.Controller.Invite(email) as RpcMethodSuccessResult;
            Assert.That(result, Is.Not.Null);
            await env.EmailService.Received().SendEmailAsync(Arg.Is(email), Arg.Any<string>(),
                Arg.Is<string>(body => body.Contains($"http://localhost/projects/{Project03}?sharing=true&shareKey=1111")));

            // Code was recorded in database
            project = env.Projects.Get(Project03);
            Assert.That(project.ShareKeys.ContainsKey(email), Is.True);

            result = await env.Controller.Invite(email) as RpcMethodSuccessResult;
            Assert.That(result, Is.Not.Null);
            // Invitation email was sent again, but with first code
            await env.EmailService.Received().SendEmailAsync(Arg.Is(email), Arg.Any<string>(),
                Arg.Is<string>(body => body.Contains($"http://localhost/projects/{Project03}?sharing=true&shareKey=1111")));

            Assert.That(project.ShareKeys[email], Is.EqualTo("1111"), "Code should not have been changed");
        }

        [Test]
        public async Task Invite_LinkSharingEnabled_UserInvited()
        {
            var env = new TestEnvironment();
            env.SetUser(User01, SystemRoles.User);
            env.SetProject(Project02);
            const string email = "newuser@example.com";
            RpcMethodSuccessResult result = await env.Controller.Invite(email) as RpcMethodSuccessResult;
            Assert.That(result, Is.Not.Null);
            await env.EmailService.Received().SendEmailAsync(Arg.Is(email), Arg.Any<string>(),
                Arg.Is<string>(body => body.Contains($"http://localhost/projects/{Project02}?sharing=true")
                && body.Contains("link can be shared with others")));
        }

        [Test]
        public async Task Invite_SharingDisabled_ForbiddenError()
        {
            var env = new TestEnvironment();
            env.SetUser(User02, SystemRoles.User);
            env.SetProject(Project01);
            const string email = "newuser@example.com";
            RpcMethodErrorResult result = await env.Controller.Invite(email) as RpcMethodErrorResult;
            Assert.That(result.ErrorCode, Is.EqualTo((int)RpcErrorCode.InvalidRequest),
                "The user should be forbidden from inviting other users");
            await env.EmailService.DidNotReceiveWithAnyArgs().SendEmailAsync(default, default, default);
        }

        [Test]
        public async Task Invite_SpecificSharingEnabled_ProjectUserNotInvited()
        {
            var env = new TestEnvironment();
            env.SetUser(User01, SystemRoles.User);
            env.SetProject(Project03);
            const string email = "user01@example.com";
            var project = env.Projects.Get(Project03);

            Assert.That(project.Users.Any(pu => pu.UserRef == User01), Is.True, "setup - user should already be a project user");

            var result = await env.Controller.Invite(email) as RpcMethodSuccessResult;
            Assert.That(result, Is.Not.Null);
            project = env.Projects.Get(Project03);
            Assert.That(project.Users.Any(pu => pu.UserRef == User01), Is.True, "user should still be a project user");

            Assert.That(project.ShareKeys.ContainsKey(email), Is.False, "no sharekey should have been added");

            // Email should not have been sent
            await env.EmailService.DidNotReceiveWithAnyArgs().SendEmailAsync(default, default, default);
        }


        [Test]
        public async Task CheckLinkSharing_LinkSharingDisabled_ForbiddenError()
        {
            var env = new TestEnvironment();
            env.SetUser(User02, SystemRoles.User);
            env.SetProject(Project01);
            RpcMethodErrorResult result = await env.Controller.CheckLinkSharing() as RpcMethodErrorResult;
            Assert.That(result.ErrorCode, Is.EqualTo((int)RpcErrorCode.InvalidRequest),
                "The user should be forbidden to join the project");
        }

        [Test]
        public async Task CheckLinkSharing_LinkSharingEnabled_UserJoined()
        {
            var env = new TestEnvironment();
            env.SetUser(User02, SystemRoles.User);
            env.SetProject(Project02);
            var project = env.Projects.Get(Project02);
            Assert.That(project.Users.Any(pu => pu.UserRef == User02), Is.False, "setup");
            RpcMethodSuccessResult result = await env.Controller.CheckLinkSharing() as RpcMethodSuccessResult;
            Assert.That(result, Is.Not.Null);
            project = env.Projects.Get(Project02);
            Assert.That(project.Users.Any(pu => pu.UserRef == User02), Is.True);
        }

        [Test]
        public async Task CheckLinkSharing_SpecificSharingUnexpectedEmail_ForbiddenError()
        {
            var env = new TestEnvironment();
            env.SetUser(User03, SystemRoles.User);
            env.SetProject(Project03);
            var project = env.Projects.Get(Project03);

            Assert.That(project.Users.Any(pu => pu.UserRef == User03), Is.False, "setup");
            Assert.That(project.ShareKeys.ContainsKey("user03@example.com"), Is.False, "setup");

            RpcMethodErrorResult result = await env.Controller.CheckLinkSharing("somecode") as RpcMethodErrorResult;
            Assert.That(result.ErrorCode, Is.EqualTo((int)RpcErrorCode.InvalidRequest),
                "The user should be forbidden to join the project: Email address was not in ShareKeys list.");
        }

        [Test]
        public async Task CheckLinkSharing_SpecificSharingAndWrongCode_ForbiddenError()
        {
            var env = new TestEnvironment();
            env.SetUser(User02, SystemRoles.User);
            env.SetProject(Project03);
            var project = env.Projects.Get(Project03);

            Assert.That(project.Users.Any(pu => pu.UserRef == User02), Is.False, "setup");
            Assert.That(project.ShareKeys.ContainsKey("user02@example.com"), Is.True, "setup");

            RpcMethodErrorResult result = await env.Controller.CheckLinkSharing("badcode") as RpcMethodErrorResult;
            Assert.That(result.ErrorCode, Is.EqualTo((int)RpcErrorCode.InvalidRequest),
                "The user should be forbidden to join the project: Email address was in ShareKeys list, but wrong code was given.");
        }

        [Test]
        public async Task CheckLinkSharing_SpecificSharingAndRightKey_UserJoined()
        {
            var env = new TestEnvironment();
            env.SetUser(User02, SystemRoles.User);
            env.SetProject(Project03);
            var project = env.Projects.Get(Project03);

            Assert.That(project.Users.Any(pu => pu.UserRef == User02), Is.False, "setup");
            Assert.That(project.ShareKeys.ContainsValue("key1234"), Is.True, "setup");
            Assert.That(project.ShareKeys.Count, Is.EqualTo(3), "setup");

            RpcMethodSuccessResult result = await env.Controller.CheckLinkSharing("key1234") as RpcMethodSuccessResult;

            Assert.That(result, Is.Not.Null);
            project = env.Projects.Get(Project03);
            Assert.That(project.Users.Any(pu => pu.UserRef == User02), Is.True, "User should have been added to project");
            Assert.That(project.ShareKeys.ContainsValue("key1234"), Is.False, "Code should have been removed from project");
        }

        private class TestEnvironment
        {
            public ISecurityUtils SecurityUtils { get; }
            public TestEnvironment(bool isResetLinkExpired = false)
            {
                UserAccessor = Substitute.For<IUserAccessor>();
                UserAccessor.Name.Returns("User 01");
                HttpRequestAccessor = Substitute.For<IHttpRequestAccessor>();

                SecurityUtils = Substitute.For<ISecurityUtils>();
                SecurityUtils.GenerateKey().Returns("1234abc");

                Projects = new MemoryRepository<TestProjectEntity>(new[]
                {
                    new TestProjectEntity
                    {
                        Id = Project01,
                        ProjectName = "Project 1",
                        Users = {
                            new TestProjectUserEntity {
                                Id = "projectuser01",
                                UserRef = User01,
                                ProjectRef = Project01,
                                Role = TestProjectRoles.Administrator
                            },
                            new TestProjectUserEntity {
                                Id = "projectuser02",
                                UserRef = User02,
                                ProjectRef = Project01,
                                Role = TestProjectRoles.Reviewer
                            }
                        },
                        ShareEnabled = false
                    },
                    new TestProjectEntity
                    {
                        Id = Project02,
                        ProjectName = "Project 2",
                        Users = {
                            new TestProjectUserEntity {
                                Id = "projectuser03",
                                UserRef = User01,
                                ProjectRef = Project02,
                                Role = TestProjectRoles.Administrator
                            }
                        },
                        ShareEnabled = true,
                        ShareLevel = SharingLevel.Anyone
                    },
                    new TestProjectEntity
                    {
                        Id = Project03,
                        ProjectName = "Project 3",
                        Users = {
                            new TestProjectUserEntity {
                                Id = "projectuser05",
                                UserRef = User01,
                                ProjectRef = Project02,
                                Role = TestProjectRoles.Administrator
                            }
                        },
                        ShareEnabled = true,
                        ShareLevel = SharingLevel.Specific,
                        ShareKeys = new Dictionary<string, string> {
                            { "bob@example.com", "key1111" },
                            { "user02@example.com", "key1234" },
                            { "bill@example.com", "key2222" }
                        }
                    }
                });

                Users = new MemoryRepository<User>(new[]
                {
                    new User
                    {
                        Id = User01,
                        Email = "user01@example.com"
                    },
                    new User
                    {
                        Id = User02,
                        Email = "user02@example.com"
                    },
                    new User
                    {
                        Id = User03,
                        Email = "user03@example.com"
                    }
                });
                var options = Substitute.For<IOptions<SiteOptions>>();
                options.Value.Returns(new SiteOptions
                {
                    Id = "xf",
                    Name = "xForge",
                    Origin = new Uri("http://localhost")
                });

                EmailService = Substitute.For<IEmailService>();

                Controller = new TestProjectsRpcController(UserAccessor, HttpRequestAccessor, Projects, Users,
                    EmailService, options);
                Controller.SecurityUtils = SecurityUtils;
            }

            public void SetUser(string userId, string role)
            {
                UserAccessor.IsAuthenticated.Returns(true);
                UserAccessor.UserId.Returns(userId);
                UserAccessor.Role.Returns(role);
            }

            public void SetProject(string projectId)
            {
                PathString path = "/json-api/projects/" + projectId + "/commands";
                HttpRequestAccessor.Path.Returns(path);
            }

            public TestProjectsRpcController Controller { get; }
            public MemoryRepository<TestProjectEntity> Projects { get; }
            public MemoryRepository<User> Users { get; }
            public IEmailService EmailService { get; }
            public IUserAccessor UserAccessor { get; }
            public IHttpRequestAccessor HttpRequestAccessor { get; }
        }
    }
}
