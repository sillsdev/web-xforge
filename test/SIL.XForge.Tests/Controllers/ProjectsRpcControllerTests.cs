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
                Arg.Is<string>(body => body.Contains($"http://localhost/projects/{Project03}?sharing=true&shareKey=1234abc")));

            // Code was recorded in database
            var project = env.Projects.Get(Project03);
            Assert.That(project.ShareKeys.ContainsKey("1234abc"));
            Assert.That(project.ShareKeys["1234abc"], Is.EqualTo(email));
        }

        [Test]
        public async Task Invite_SpecificSharingEnabled_UserInvitedTwiceButWithSameCode()
        {
            var env = new TestEnvironment();
            env.SetUser(User01, SystemRoles.User);
            env.SetProject(Project03);
            const string email = "newuser@example.com";

            var project = env.Projects.Get(Project03);
            Assert.That(project.ShareKeys.ContainsValue(email), Is.False, "setup");

            env.SecurityUtils.GenerateKey().Returns("1111", "3333");
            RpcMethodSuccessResult result = await env.Controller.Invite(email) as RpcMethodSuccessResult;
            Assert.That(result, Is.Not.Null);
            await env.EmailService.Received().SendEmailAsync(Arg.Is(email), Arg.Any<string>(),
                Arg.Is<string>(body => body.Contains($"http://localhost/projects/{Project03}?sharing=true&shareKey=1111")));

            // Code was recorded in database
            project = env.Projects.Get(Project03);
            Assert.That(project.ShareKeys.ContainsValue(email), Is.True);
            Assert.That(project.ShareKeys.Where(sk => sk.Value == email).Count, Is.EqualTo(1), "there should be only one code stored for this email address");

            result = await env.Controller.Invite(email) as RpcMethodSuccessResult;
            Assert.That(result, Is.Not.Null);
            // Invitation email was sent again, but with first code
            await env.EmailService.Received().SendEmailAsync(Arg.Is(email), Arg.Any<string>(),
                Arg.Is<string>(body => body.Contains($"http://localhost/projects/{Project03}?sharing=true&shareKey=1111")));

            // No additional code was recorded in database
            project = env.Projects.Get(Project03);
            Assert.That(project.ShareKeys.ContainsValue(email), Is.True);
            Assert.That(project.ShareKeys.Where(sk => sk.Value == email).Count, Is.EqualTo(1), "additional codes should not have been recorded for this email address");

            Assert.That(project.ShareKeys.Where(sk => sk.Value == email).FirstOrDefault().Key,
                Is.EqualTo("1111"), "Code should not have been changed");
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
                Arg.Is<string>(body => body.Contains($"http://localhost/projects/{Project02}?sharing=true")));
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
        }

        [Test]
        public async Task Invite_SpecificSharingEnabled_ProjectUserNotInvited()
        {
            var env = new TestEnvironment();
            env.SetUser(User01, SystemRoles.User);
            env.SetProject(Project03);
            const string email = "user01@example.com";
            RpcMethodErrorResult result = await env.Controller.Invite(email) as RpcMethodErrorResult;
            Assert.That(result.ErrorCode, Is.EqualTo((int)RpcErrorCode.InvalidParams),
                "can't invite user who is already on the project");
            Assert.That(result.Message, Contains.Substring("project"), "explanation should be given");
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
            Assert.That(project.ShareKeys.ContainsValue("user03@example.com"), Is.False, "setup");

            RpcMethodErrorResult result = await env.Controller.CheckLinkSharing("somecode") as RpcMethodErrorResult;
            // Email address was not in ShareKeys list.
            Assert.That(result.ErrorCode, Is.EqualTo((int)RpcErrorCode.InvalidRequest),
                "The user should be forbidden to join the project");
        }

        [Test]
        public async Task CheckLinkSharing_SpecificSharingAndWrongCode_ForbiddenError()
        {
            var env = new TestEnvironment();
            env.SetUser(User02, SystemRoles.User);
            env.SetProject(Project03);
            var project = env.Projects.Get(Project03);

            Assert.That(project.Users.Any(pu => pu.UserRef == User02), Is.False, "setup");
            Assert.That(project.ShareKeys.ContainsValue("user02@example.com"), Is.True, "setup");

            RpcMethodErrorResult result = await env.Controller.CheckLinkSharing("badcode") as RpcMethodErrorResult;
            // Email address was in ShareKeys list, but wrong code was given.
            Assert.That(result.ErrorCode, Is.EqualTo((int)RpcErrorCode.InvalidRequest),
                "The user should be forbidden to join the project");
        }

        [Test]
        public async Task CheckLinkSharing_SpecificSharingAndRightKey_UserJoined()
        {
            var env = new TestEnvironment();
            env.SetUser(User02, SystemRoles.User);
            env.SetProject(Project03);
            var project = env.Projects.Get(Project03);

            Assert.That(project.Users.Any(pu => pu.UserRef == User02), Is.False, "setup");
            Assert.That(project.ShareKeys.ContainsKey("key1234"), Is.True, "setup");
            Assert.That(project.ShareKeys.Count, Is.EqualTo(3), "setup");

            RpcMethodSuccessResult result = await env.Controller.CheckLinkSharing("key1234") as RpcMethodSuccessResult;

            Assert.That(result, Is.Not.Null);
            project = env.Projects.Get(Project03);
            Assert.That(project.Users.Any(pu => pu.UserRef == User02), Is.True, "User should have been added to project");
            Assert.That(project.ShareKeys.ContainsKey("key1234"), Is.False, "Share key should have been removed from project");
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
                            { "key1111", "bob@example.com" },
                            { "key1234", "user02@example.com" },
                            { "key2222", "bill@example.com" }
                        }
                    }
                });

                Users = new MemoryRepository<UserEntity>(
                    entities: new[]
                    {
                        new UserEntity
                        {
                            Id = User01,
                            Email = "user01@example.com"
                        },
                        new UserEntity
                        {
                            Id = User02,
                            Email = "user02@example.com"
                        },
                        new UserEntity
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
            public MemoryRepository<UserEntity> Users { get; }
            public IEmailService EmailService { get; }
            public IUserAccessor UserAccessor { get; }
            public IHttpRequestAccessor HttpRequestAccessor { get; }
        }
    }
}
