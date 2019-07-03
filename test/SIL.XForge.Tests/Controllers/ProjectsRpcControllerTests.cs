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

        [Test]
        public async Task Invite_Unimplemented_Forbidden()
        {
            var env = new TestEnvironment();
            env.SetUser(User01, SystemRoles.User);
            env.SetProject(Project02);
            const string email = "newuser@example.com";
            RpcMethodErrorResult result = await env.Controller.Invite(email) as RpcMethodErrorResult;
            Assert.That(result.ErrorCode, Is.EqualTo((int)RpcErrorCode.InvalidRequest),
                "The user should be forbidden from inviting other users");
        }

        [Test]
        public async Task CheckLinkSharing_Unimplemented_Forbidden()
        {
            var env = new TestEnvironment();
            env.SetUser(User02, SystemRoles.User);
            env.SetProject(Project02);
            RpcMethodErrorResult result = await env.Controller.CheckLinkSharing() as RpcMethodErrorResult;
            Assert.That(result.ErrorCode, Is.EqualTo((int)RpcErrorCode.InvalidRequest),
                "The user should be forbidden to join the project");
            var project = env.Projects.Get(Project02);
            Assert.That(project.Users.Any(pu => pu.UserRef == User02), Is.False);
        }

        private class TestEnvironment
        {
            public TestEnvironment(bool isResetLinkExpired = false)
            {
                UserAccessor = Substitute.For<IUserAccessor>();
                UserAccessor.Name.Returns("User 01");
                HttpRequestAccessor = Substitute.For<IHttpRequestAccessor>();

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
                        CheckingConfig = new TestCheckingConfig {
                            Enabled = true,
                            Share = new ShareConfig
                            {
                                Enabled = false
                            }
                        }
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
                        CheckingConfig = new TestCheckingConfig {
                            Enabled = true,
                            Share = new ShareConfig
                            {
                                Enabled = true,
                                Level = ShareLevel.Anyone
                            }
                        }
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
                        CheckingConfig = new TestCheckingConfig {
                            Enabled = true,
                            Share = new ShareConfig
                            {
                                Enabled = true,
                                Level = ShareLevel.Specific
                            }
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
