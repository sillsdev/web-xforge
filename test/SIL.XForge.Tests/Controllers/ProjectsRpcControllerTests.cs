using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using Microsoft.AspNetCore.Http;
using NSubstitute;
using NUnit.Framework;
using JsonApiDotNetCore.Internal;
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
        private const string project01Id = "project01";
        private const string project02Id = "project02";
        private const string user01Id = "user01";
        private const string user02Id = "user02";

        [Test]
        public async Task SendInvite_NoUser_InvitedEmail()
        {
            var env = new TestEnvironment();
            env.SetUser(user01Id, SystemRoles.User);
            env.SetProject(project01Id);
            const string email = "abc1@example.com";
            Assert.That(env.Users.Query().Any(x => x.Email == email), Is.False);
            UserEntity invitedUser = env.Users.Query().FirstOrDefault(u => u.Email == email);
            Assert.IsNull(invitedUser);
            ProjectUserEntity[] projectUsers = env.Projects.Query()
                .FirstOrDefault(p => p.Id == project01Id).Users.ToArray();
            Assert.That(projectUsers.Select(pu => pu.UserRef), Is.EquivalentTo(new[] { user01Id, user02Id }));

            RpcMethodSuccessResult result = await env.Controller.Invite(email) as RpcMethodSuccessResult;

            Assert.That(env.Users.Query().Any(x => x.Email == email), Is.True);
            Assert.That(result.ReturnObject, Is.EqualTo("invited"));
            string subject = "You've been invited to the project Project 1 on xForge";
            // Skip verification for the body, we may change the content
            await env.EmailService.Received().SendEmailAsync(Arg.Is(email), Arg.Is(subject), Arg.Any<string>());
            invitedUser = env.Users.Query().First(u => u.Email == email);
            projectUsers = env.Projects.Query().FirstOrDefault(p => p.Id == project01Id).Users.ToArray();
            Assert.That(projectUsers.Select(pu => pu.UserRef), Is.EquivalentTo(new[] {
                user01Id,
                user02Id,
                invitedUser.Id
            }));
        }

        [Test]
        public async Task SendInvite_UserNoProjects_JoinedEmail()
        {
            var env = new TestEnvironment();
            env.SetUser(user01Id, SystemRoles.User);
            env.SetProject(project01Id);
            const string email = "userwithoutprojects@example.com";
            env.Users.Add(new[]
                {
                    new UserEntity
                    {
                        Id = "userwithoutprojects",
                        Email = email,
                        CanonicalEmail = email
                    }
                });
            Assert.That(env.Users.Query().Any(x => x.Email == email), Is.True);
            ProjectUserEntity[] projectUsers = env.Projects.Query()
                .FirstOrDefault(p => p.Id == project01Id).Users.ToArray();
            Assert.That(projectUsers.Select(pu => pu.UserRef), Is.EquivalentTo(new[] { user01Id, user02Id }));

            RpcMethodSuccessResult result = await env.Controller.Invite(email) as RpcMethodSuccessResult;

            Assert.That(env.Users.Query().Any(x => x.Email == email), Is.True);
            Assert.That(result.ReturnObject, Is.EqualTo("joined"));
            string subject = "You've been added to the project Project 1 on xForge";
            // Skip verification for the body, we may change the content
            await env.EmailService.Received().SendEmailAsync(Arg.Is(email), Arg.Is(subject), Arg.Any<string>());
            projectUsers = env.Projects.Query().FirstOrDefault(p => p.Id == project01Id).Users.ToArray();
            Assert.That(projectUsers.Select(pu => pu.UserRef), Is.EquivalentTo(new[] {
                user01Id,
                user02Id,
                "userwithoutprojects"
            }));
        }

        [Test]
        public async Task SendInvite_UserInProject_NoneResult()
        {
            var env = new TestEnvironment();
            env.SetUser(user01Id, SystemRoles.User);
            env.SetProject(project01Id);
            ProjectUserEntity[] projectUsers = env.Projects.Query()
                .FirstOrDefault(p => p.Id == project01Id).Users.ToArray();
            Assert.That(projectUsers.Select(pu => pu.UserRef), Is.EquivalentTo(new[] { user01Id, user02Id }));

            UserEntity user02 = env.Users.Query().FirstOrDefault(u => u.Id == user02Id);
            RpcMethodSuccessResult result = await env.Controller.Invite(user02.Email) as RpcMethodSuccessResult;

            Assert.That(result.ReturnObject, Is.EqualTo("none"));
            projectUsers = env.Projects.Query().FirstOrDefault(p => p.Id == project01Id).Users.ToArray();
            Assert.That(projectUsers.Select(pu => pu.UserRef), Is.EquivalentTo(new[] { user01Id, user02Id }));
        }

        [Test]
        public async Task SendInvite_ProjectAdminInviteDisabled_UserInvited()
        {
            var env = new TestEnvironment();
            env.SetUser(user01Id, SystemRoles.User);
            env.SetProject(project02Id);
            const string email = "newuser@example.com";
            RpcMethodSuccessResult result = await env.Controller.Invite(email) as RpcMethodSuccessResult;
            Assert.That(result.ReturnObject, Is.EqualTo("invited"));
        }

        [Test]
        public async Task SendInvite_InviteEnabled_UserInvited()
        {
            var env = new TestEnvironment();
            env.SetUser(user01Id, SystemRoles.User);
            env.SetProject(project02Id);
            const string email = "newuser@example.com";
            RpcMethodSuccessResult result = await env.Controller.Invite(email) as RpcMethodSuccessResult;
            Assert.That(result.ReturnObject, Is.EqualTo("invited"));
        }

        [Test]
        public async Task SendInvite_InviteDisabled_ForbiddenException()
        {
            var env = new TestEnvironment();
            env.SetUser(user02Id, SystemRoles.User);
            env.SetProject(project02Id);
            const string email = "newuser@example.com";
            RpcMethodErrorResult result = await env.Controller.Invite(email) as RpcMethodErrorResult;
            Assert.That(result.ErrorCode, Is.EqualTo((int)RpcErrorCode.InvalidRequest),
                "The user should have been forbidden to invite other users"
            );
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
                        Id = project01Id,
                        ProjectName = "Project 1",
                        Users = {
                            new TestProjectUserEntity {
                                Id = "projectuser01",
                                UserRef = user01Id,
                                ProjectRef = project01Id,
                                Role = TestProjectRoles.Administrator
                            },
                            new TestProjectUserEntity {
                                Id = "projectuser02",
                                UserRef = user02Id,
                                ProjectRef = project01Id,
                                Role = TestProjectRoles.Reviewer
                            }
                        }
                    },
                    new TestProjectEntity
                    {
                        Id = project02Id,
                        ProjectName = "Project 2",
                        Users = {
                            new TestProjectUserEntity {
                                Id = "projectuser03",
                                UserRef = user01Id,
                                ProjectRef = project02Id,
                                Role = TestProjectRoles.Administrator
                            },
                            new TestProjectUserEntity {
                                Id = "projectuser04",
                                UserRef = user02Id,
                                ProjectRef = project02Id,
                                Role = TestProjectRoles.Reviewer
                            }
                        },
                        CheckingConfig = new TestCheckingConfig {
                            Share = new TestCheckingConfigShare
                            {
                                Enabled = false,
                                ViaEmail = false
                            }
                        }
                    }
                });

                Users = new MemoryRepository<UserEntity>(
                    uniqueKeySelectors: new Func<UserEntity, object>[]
                    {
                        u => u.CanonicalEmail,
                        u => u.Username
                    },
                    entities: new[]
                    {
                        new UserEntity
                        {
                            Id = user01Id,
                            Email = "user01@example.com",
                            CanonicalEmail = "user01@example.com"
                        },
                        new UserEntity
                        {
                            Id = user02Id,
                            Email = "user02@example.com",
                            CanonicalEmail = "user02@example.com"
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
                UserAccessor.SystemRole.Returns(role);
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
