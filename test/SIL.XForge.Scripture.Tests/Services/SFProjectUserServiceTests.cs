using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using AutoMapper;
using JsonApiDotNetCore.Internal;
using JsonApiDotNetCore.Internal.Query;
using JsonApiDotNetCore.Models;
using Microsoft.AspNetCore.Http;
using NSubstitute;
using NUnit.Framework;
using SIL.Machine.WebApi.Services;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Services
{
    [TestFixture]
    public class SFProjectUserServiceTests
    {
        private const string User01Id = "user01";
        private const string User02Id = "user02";
        private const string User03Id = "user03";

        [Test]
        public async Task CreateAsync_UserRoleSameUser()
        {
            using (var env = new TestEnvironment())
            {
                env.SetUser(User02Id, SystemRoles.User);
                env.ParatextService.TryGetProjectRoleAsync(Arg.Any<UserEntity>(), "pt01")
                    .Returns(Task.FromResult(Attempt.Success(SFProjectRoles.Administrator)));

                Assert.That(env.ContainsProjectUser("projectusernew"), Is.False);

                var projectUser = new SFProjectUserResource
                {
                    Id = "projectusernew",
                    ProjectRef = "project01",
                    Project = new SFProjectResource { Id = "project01" },
                    UserRef = User02Id,
                    User = new UserResource { Id = User02Id }
                };
                SFProjectUserResource newProjectUser = await env.Service.CreateAsync(projectUser);

                Assert.That(newProjectUser, Is.Not.Null);
                Assert.That(newProjectUser.Id, Is.EqualTo("projectusernew"));
                Assert.That(newProjectUser.ProjectRef, Is.EqualTo("project01"));
                Assert.That(newProjectUser.UserRef, Is.EqualTo(User02Id));
                Assert.That(env.ContainsProjectUser("projectusernew"), Is.True);
            }
        }

        [Test]
        public void CreateAsync_UserRoleDifferentUser()
        {
            using (var env = new TestEnvironment())
            {
                env.SetUser(User02Id, SystemRoles.User);
                env.ParatextService.TryGetProjectRoleAsync(Arg.Any<UserEntity>(), "pt01")
                    .Returns(Task.FromResult(Attempt.Success(SFProjectRoles.Administrator)));

                Assert.That(env.ContainsProjectUser("projectusernew"), Is.False);

                var projectUser = new SFProjectUserResource
                {
                    Id = "projectusernew",
                    ProjectRef = "project01",
                    Project = new SFProjectResource { Id = "project01" },
                    UserRef = User03Id,
                    User = new UserResource { Id = User03Id }
                };
                var ex = Assert.ThrowsAsync<JsonApiException>(async () =>
                    {
                        await env.Service.CreateAsync(projectUser);
                    });

                Assert.That(ex.GetStatusCode(), Is.EqualTo(StatusCodes.Status403Forbidden));
            }
        }

        [Test]
        public async Task CreateAsync_SystemAdminRoleDifferentUser()
        {
            using (var env = new TestEnvironment())
            {
                env.SetUser(User02Id, SystemRoles.SystemAdmin);
                env.ParatextService.TryGetProjectRoleAsync(Arg.Any<UserEntity>(), "pt01")
                    .Returns(Task.FromResult(Attempt.Success(SFProjectRoles.Administrator)));

                Assert.That(env.ContainsProjectUser("projectusernew"), Is.False);

                var projectUser = new SFProjectUserResource
                {
                    Id = "projectusernew",
                    ProjectRef = "project01",
                    Project = new SFProjectResource { Id = "project01" },
                    UserRef = User03Id,
                    User = new UserResource { Id = User03Id }
                };
                SFProjectUserResource newProjectUser = await env.Service.CreateAsync(projectUser);

                Assert.That(newProjectUser, Is.Not.Null);
                Assert.That(newProjectUser.Id, Is.EqualTo("projectusernew"));
                Assert.That(newProjectUser.ProjectRef, Is.EqualTo("project01"));
                Assert.That(newProjectUser.UserRef, Is.EqualTo(User03Id));
                Assert.That(env.ContainsProjectUser("projectusernew"), Is.True);
            }
        }

        [Test]
        public async Task UpdateAsync_UserRoleSameUser()
        {
            using (var env = new TestEnvironment())
            {
                env.SetUser(User01Id, SystemRoles.User);
                env.JsonApiContext.AttributesToUpdate.Returns(new Dictionary<AttrAttribute, object>
                    {
                        { env.GetAttribute("selected-book-id"), "text02" }
                    });
                env.JsonApiContext.RelationshipsToUpdate.Returns(new Dictionary<RelationshipAttribute, object>());

                var projectUser = new SFProjectUserResource
                {
                    Id = "projectuser01",
                    SelectedBookId = "text02"
                };
                SFProjectUserResource updatedProjectUser = await env.Service.UpdateAsync(projectUser.Id, projectUser);

                Assert.That(updatedProjectUser, Is.Not.Null);
                Assert.That(updatedProjectUser.SelectedBookId, Is.EqualTo("text02"));
            }
        }

        [Test]
        public void UpdateAsync_UserRoleDifferentUser()
        {
            using (var env = new TestEnvironment())
            {
                env.SetUser(User02Id, SystemRoles.User);
                env.JsonApiContext.AttributesToUpdate.Returns(new Dictionary<AttrAttribute, object>
                    {
                        { env.GetAttribute("selected-book-id"), "text02" }
                    });
                env.JsonApiContext.RelationshipsToUpdate.Returns(new Dictionary<RelationshipAttribute, object>());

                var projectUser = new SFProjectUserResource
                {
                    Id = "projectuser01",
                    SelectedBookId = "text02"
                };
                var ex = Assert.ThrowsAsync<JsonApiException>(async () =>
                    {
                        await env.Service.UpdateAsync(projectUser.Id, projectUser);
                    });

                Assert.That(ex.GetStatusCode(), Is.EqualTo(StatusCodes.Status403Forbidden));
            }
        }

        [Test]
        public async Task UpdateAsync_SystemAdminRoleDifferentUser()
        {
            using (var env = new TestEnvironment())
            {
                env.SetUser(User02Id, SystemRoles.SystemAdmin);
                env.JsonApiContext.AttributesToUpdate.Returns(new Dictionary<AttrAttribute, object>
                    {
                        { env.GetAttribute("selected-book-id"), "text02" }
                    });
                env.JsonApiContext.RelationshipsToUpdate.Returns(new Dictionary<RelationshipAttribute, object>());

                var projectUser = new SFProjectUserResource
                {
                    Id = "projectuser01",
                    SelectedBookId = "text02"
                };
                SFProjectUserResource updatedProjectUser = await env.Service.UpdateAsync(projectUser.Id, projectUser);

                Assert.That(updatedProjectUser, Is.Not.Null);
                Assert.That(updatedProjectUser.SelectedBookId, Is.EqualTo("text02"));
            }
        }

        [Test]
        public async Task DeleteAsync_UserRoleSameUser()
        {
            using (var env = new TestEnvironment())
            {
                env.SetUser(User01Id, SystemRoles.User);

                Assert.That(await env.Service.DeleteAsync("projectuser01"), Is.True);

                Assert.That(env.ContainsProjectUser("projectuser01"), Is.False);
            }
        }

        [Test]
        public async Task DeleteAsync_ProjectAdmin()
        {
            using (var env = new TestEnvironment())
            {
                env.SetUser(User02Id, SystemRoles.User);

                Assert.That(await env.Service.DeleteAsync("projectuser04"), Is.True);

                Assert.That(env.ContainsProjectUser("projectuser04"), Is.False);
            }
        }

        [Test]
        public void UpdateRelationshipsAsync_NotAllowed()
        {
            using (var env = new TestEnvironment())
            {
                env.SetUser(User01Id, SystemRoles.User);

                var ex = Assert.ThrowsAsync<JsonApiException>(async () =>
                    {
                        await env.Service.UpdateRelationshipsAsync("projectuser01", "project",
                            new List<ResourceObject>());
                    });

                Assert.That(ex.GetStatusCode(), Is.EqualTo(StatusCodes.Status405MethodNotAllowed));
            }
        }

        [Test]
        public async Task GetAsync_NonProjectAdmin()
        {
            using (var env = new TestEnvironment())
            {
                env.SetUser(User01Id, SystemRoles.User);
                env.JsonApiContext.QuerySet.Returns(new QuerySet
                {
                    SortParameters = { new SortQuery(SortDirection.Ascending, "role") }
                });
                env.JsonApiContext.PageManager.Returns(new PageManager());

                SFProjectUserResource[] results = (await env.Service.GetAsync()).ToArray();

                Assert.That(results.Length, Is.EqualTo(3));
                Assert.That(results[0].ProjectRef, Is.EqualTo("project03"));
                Assert.That(results[1].ProjectRef, Is.EqualTo("project01"));
                Assert.That(results[2].ProjectRef, Is.EqualTo("project04"));
            }
        }

        [Test]
        public async Task GetAsync_ProjectAdmin()
        {
            using (var env = new TestEnvironment())
            {
                env.SetUser(User02Id, SystemRoles.User);
                env.JsonApiContext.QuerySet.Returns(new QuerySet
                {
                    SortParameters = { new SortQuery(SortDirection.Ascending, "role") }
                });
                env.JsonApiContext.PageManager.Returns(new PageManager());

                SFProjectUserResource[] results = (await env.Service.GetAsync()).ToArray();

                Assert.That(results.Length, Is.EqualTo(3));
                Assert.That(results[0].ProjectRef, Is.EqualTo("project02"));
                Assert.That(results[1].ProjectRef, Is.EqualTo("project04"));
                Assert.That(results[2].ProjectRef, Is.EqualTo("project04"));
                Assert.That(results[0].UserRef, Is.EqualTo(User02Id));
                Assert.That(results[1].UserRef, Is.EqualTo(User02Id));
                Assert.That(results[2].UserRef, Is.EqualTo(User01Id));
            }
        }

        [Test]
        public async Task GetRelationshipAsync()
        {
            using (var env = new TestEnvironment())
            {
                env.SetUser(User01Id, SystemRoles.User);
                env.JsonApiContext.QuerySet.Returns(new QuerySet
                {
                    SortParameters = { new SortQuery(SortDirection.Ascending, "role") }
                });
                env.JsonApiContext.PageManager.Returns(new PageManager());

                var project = (SFProjectResource)await env.Service.GetRelationshipAsync("projectuser01", "project");

                Assert.That(project, Is.Not.Null);
                Assert.That(project.Id, Is.EqualTo("project01"));
            }
        }

        class TestEnvironment : ResourceServiceTestEnvironmentBase<SFProjectUserResource, SFProjectEntity>
        {
            public TestEnvironment()
                : base("project-users")
            {
                Users = new MemoryRepository<UserEntity>(new[]
                    {
                        new UserEntity { Id = User01Id },
                        new UserEntity { Id = User02Id },
                        new UserEntity { Id = User03Id }
                    });
                ParatextService = Substitute.For<IParatextService>();
                var engineService = Substitute.For<IEngineService>();
                var syncService = Substitute.For<ISyncService>();
                var realtimeService = Substitute.For<IRealtimeService>();
                Service = new SFProjectUserService(JsonApiContext, Mapper, UserAccessor, Entities, Users,
                    ParatextService)
                {
                    ProjectMapper = new SFProjectService(JsonApiContext, Mapper, UserAccessor, Entities,
                        engineService, SiteOptions, syncService, realtimeService),
                    UserMapper = new UserService(JsonApiContext, Mapper, UserAccessor, Users, SiteOptions)
                };
            }

            public MemoryRepository<UserEntity> Users { get; }
            public IParatextService ParatextService { get; }
            public SFProjectUserService Service { get; }

            public bool ContainsProjectUser(string id)
            {
                return Entities.Query().SelectMany(p => p.Users).Any(u => u.Id == id);
            }

            protected override IEnumerable<SFProjectEntity> GetInitialData()
            {
                return new[]
                {
                    new SFProjectEntity
                    {
                        Id = "project01",
                        ProjectName = "project01",
                        ParatextId = "pt01",
                        Users =
                        {
                            new SFProjectUserEntity
                            {
                                Id = "projectuser01",
                                UserRef = User01Id,
                                Role = SFProjectRoles.Translator,
                                SelectedBookId = "text01"
                            }
                        }
                    },
                    new SFProjectEntity
                    {
                        Id = "project02",
                        ProjectName = "project02",
                        Users =
                        {
                            new SFProjectUserEntity
                            {
                                Id = "projectuser02",
                                UserRef = User02Id,
                                Role = SFProjectRoles.Administrator
                            }
                        }
                    },
                    new SFProjectEntity
                    {
                        Id = "project03",
                        ProjectName = "project03",
                        Users =
                        {
                            new SFProjectUserEntity
                            {
                                Id = "projectuser03",
                                UserRef = User01Id,
                                Role = SFProjectRoles.Administrator
                            }
                        }
                    },
                    new SFProjectEntity
                    {
                        Id = "project04",
                        ProjectName = "project04",
                        Users =
                        {
                            new SFProjectUserEntity
                            {
                                Id = "projectuser04",
                                UserRef = User01Id,
                                Role = SFProjectRoles.Translator
                            },
                            new SFProjectUserEntity
                            {
                                Id = "projectuser05",
                                UserRef = User02Id,
                                Role = SFProjectRoles.Administrator
                            }
                        }
                    }
                };
            }

            protected override void SetupMapper(IMapperConfigurationExpression config)
            {
                config.AddProfile<SFMapperProfile>();
            }
        }
    }
}
