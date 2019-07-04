using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using Microsoft.AspNetCore.Http;
using NSubstitute;
using NUnit.Framework;
using EdjCase.JsonRpc.Core;
using EdjCase.JsonRpc.Router.Defaults;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Services;
using SIL.XForge.Scripture.Controllers;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Controllers
{
    [TestFixture]
    public class SFProjectsRpcControllerTests
    {
        private const string Project01 = "project01";
        private const string Project02 = "project02";
        private const string Project03 = "project03";
        private const string User01 = "user01";
        private const string User02 = "user02";

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
                Arg.Is<string>(body => body.Contains($"http://localhost/projects/{Project03}?sharing=true&shareKey=bigsecret")));

            // Code was recorded in database
            SFProjectEntity project = env.Projects.Get(Project03);
            Assert.That(project.ShareKeys.ContainsKey("bigsecret"));
            Assert.That(project.ShareKeys["bigsecret"], Is.EqualTo("newuser@example.com"));
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
            SFProjectEntity project = env.Projects.Get(Project02);
            Assert.That(project.Users.Any(pu => pu.UserRef == User02), Is.False);
            RpcMethodSuccessResult result = await env.Controller.CheckLinkSharing() as RpcMethodSuccessResult;
            Assert.That(result, Is.Not.Null);
            project = env.Projects.Get(Project02);
            Assert.That(project.Users.Any(pu => pu.UserRef == User02), Is.True);
        }

        [Test]
        public async Task CheckLinkSharing_SpecificSharingAndWrongKey_ForbiddenError()
        {
            var env = new TestEnvironment();
            env.SetUser(User02, SystemRoles.User);
            env.SetProject(Project03);
            RpcMethodErrorResult result = await env.Controller.CheckLinkSharing("badkey") as RpcMethodErrorResult;
            Assert.That(result.ErrorCode, Is.EqualTo((int)RpcErrorCode.InvalidRequest),
                "The user should be forbidden to join the project");
        }

        [Test]
        public async Task CheckLinkSharing_SpecificSharing_UserJoined()
        {
            var env = new TestEnvironment();
            env.SetUser(User02, SystemRoles.User);
            env.SetProject(Project03);
            SFProjectEntity project = env.Projects.Get(Project03);

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
            public TestEnvironment(bool isResetLinkExpired = false)
            {
                UserAccessor = Substitute.For<IUserAccessor>();
                UserAccessor.Name.Returns("User 01");
                HttpRequestAccessor = Substitute.For<IHttpRequestAccessor>();

                var project03ShareKeys = new System.Collections.Generic.Dictionary<string, string> { { "key1111", "bob@example.com" }, { "key1234", "user02@example.com" }, { "key2222", "bill@example.com" } };


                Projects = new MemoryRepository<SFProjectEntity>(new SFProjectEntity[]
                {
                    new SFProjectEntity
                    {
                        Id = Project01,
                        ProjectName = "Project 1",
                        Users = {
                            new TestProjectUserEntity {
                                Id = "projectuser01",
                                UserRef = User01,
                                ProjectRef = Project01,
                                Role = SFProjectRoles.Administrator
                            },
                            new TestProjectUserEntity {
                                Id = "projectuser02",
                                UserRef = User02,
                                ProjectRef = Project01,
                                Role = SFProjectRoles.SFReviewer
                            }
                        },
                        CheckingEnabled = true,

                            Share = new ShareConfig
                            {
                                Enabled = false
                            }

                    },
                    new SFProjectEntity
                    {
                        Id = Project02,
                        ProjectName = "Project 2",
                        Users = {
                            new TestProjectUserEntity {
                                Id = "projectuser03",
                                UserRef = User01,
                                ProjectRef = Project02,
                                Role = SFProjectRoles.Administrator
                            }
                        },
                        CheckingEnabled = true,
                            Share = new ShareConfig
                            {
                                Enabled = true,
                                Level = ShareLevel.Anyone
                            }

                    },
                    new SFProjectEntity
                    {
                        Id = Project03,
                        ProjectName = "Project 3",
                        Users = {
                            new TestProjectUserEntity {
                                Id = "projectuser05",
                                UserRef = User01,
                                ProjectRef = Project02,
                                Role = SFProjectRoles.Administrator
                            }
                        },
                        CheckingEnabled = true,
                            Share = new ShareConfig
                            {
                                Enabled = true,
                                Level = ShareLevel.Specific
                            },
                            ShareKeys=project03ShareKeys

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

                Controller = new SFProjectsRpcController(UserAccessor, HttpRequestAccessor, Projects, Users,
                    EmailService, options, null, null);
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

            public SFProjectsRpcController Controller { get; }
            public MemoryRepository<SFProjectEntity> Projects { get; }
            public MemoryRepository<UserEntity> Users { get; }
            public IEmailService EmailService { get; }
            public IUserAccessor UserAccessor { get; }
            public IHttpRequestAccessor HttpRequestAccessor { get; }
        }
    }
}
