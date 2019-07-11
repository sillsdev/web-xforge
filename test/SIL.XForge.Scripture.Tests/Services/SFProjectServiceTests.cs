using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using AutoMapper;
using JsonApiDotNetCore.Internal;
using JsonApiDotNetCore.Internal.Query;
using JsonApiDotNetCore.Models;
using Microsoft.AspNetCore.Http;
using NSubstitute;
using NUnit.Framework;
using SIL.Machine.WebApi.Models;
using SIL.Machine.WebApi.Services;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services
{
    [TestFixture]
    public class SFProjectServiceTests
    {
        private const string User01Id = "user01";
        private const string User02Id = "user02";

        [Test]
        public async Task UpdateAsync_UserRole()
        {
            using (var env = new TestEnvironment())
            {
                env.SetUser(User01Id, SystemRoles.User);
                env.JsonApiContext.AttributesToUpdate.Returns(new Dictionary<AttrAttribute, object>
                    {
                        { env.GetAttribute("project-name"), "new" }
                    });
                env.JsonApiContext.RelationshipsToUpdate.Returns(new Dictionary<RelationshipAttribute, object>());

                var resource = new SFProjectResource
                {
                    Id = "project02",
                    ProjectName = "new"
                };
                var ex = Assert.ThrowsAsync<JsonApiException>(async () =>
                    {
                        await env.Service.UpdateAsync(resource.Id, resource);
                    });

                Assert.That(ex.GetStatusCode(), Is.EqualTo(StatusCodes.Status403Forbidden));

                resource.Id = "project01";
                SFProjectResource updatedResource = await env.Service.UpdateAsync(resource.Id, resource);

                Assert.That(updatedResource, Is.Not.Null);
                Assert.That(updatedResource.ProjectName, Is.EqualTo("new"));

                await env.EngineService.DidNotReceive().RemoveProjectAsync(Arg.Any<string>());
                await env.EngineService.DidNotReceive().AddProjectAsync(Arg.Any<Project>());
                await env.SyncService.DidNotReceive().SyncAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>());
            }
        }

        [Test]
        public async Task UpdateAsync_SystemAdminRole()
        {
            using (var env = new TestEnvironment())
            {
                env.SetUser(User01Id, SystemRoles.SystemAdmin);
                env.JsonApiContext.AttributesToUpdate.Returns(new Dictionary<AttrAttribute, object>
                    {
                        { env.GetAttribute("project-name"), "new" }
                    });
                env.JsonApiContext.RelationshipsToUpdate.Returns(new Dictionary<RelationshipAttribute, object>());

                var resource = new SFProjectResource
                {
                    Id = "project02",
                    ProjectName = "new"
                };

                SFProjectResource updatedResource = await env.Service.UpdateAsync(resource.Id, resource);

                Assert.That(updatedResource, Is.Not.Null);
                Assert.That(updatedResource.ProjectName, Is.EqualTo("new"));

                await env.EngineService.DidNotReceive().RemoveProjectAsync(Arg.Any<string>());
                await env.EngineService.DidNotReceive().AddProjectAsync(Arg.Any<Project>());
                await env.SyncService.DidNotReceive().SyncAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>());
            }
        }

        [Test]
        public async Task UpdateAsync_ChangeSourceProject_RecreateMachineProjectAndSync()
        {
            using (var env = new TestEnvironment())
            {
                env.SetUser(User01Id, SystemRoles.User);
                env.JsonApiContext.AttributesToUpdate.Returns(new Dictionary<AttrAttribute, object>
                    {
                        { env.GetAttribute("source-paratext-id"), "changedId" }
                    });
                env.JsonApiContext.RelationshipsToUpdate.Returns(new Dictionary<RelationshipAttribute, object>());
                var resource = new SFProjectResource
                {
                    Id = "project01",
                    SourceParatextId = "changedId"
                };

                SFProjectResource updatedResource = await env.Service.UpdateAsync(resource.Id, resource);

                Assert.That(updatedResource, Is.Not.Null);
                Assert.That(updatedResource.SourceParatextId, Is.EqualTo("changedId"));

                await env.EngineService.Received().RemoveProjectAsync(Arg.Any<string>());
                await env.EngineService.Received().AddProjectAsync(Arg.Any<Project>());
                await env.SyncService.Received().SyncAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>());
            }
        }

        [Test]
        public async Task UpdateAsync_EnableTranslate_CreateMachineProjectAndSync()
        {
            using (var env = new TestEnvironment())
            {
                env.SetUser(User02Id, SystemRoles.User);
                env.JsonApiContext.AttributesToUpdate.Returns(new Dictionary<AttrAttribute, object>
                    {
                        { env.GetAttribute("translate-enabled"), true },
                        { env.GetAttribute("source-paratext-id"), "changedId" }
                    });
                env.JsonApiContext.RelationshipsToUpdate.Returns(new Dictionary<RelationshipAttribute, object>());
                var resource = new SFProjectResource
                {
                    Id = "project02",
                    TranslateEnabled = true,
                    SourceParatextId = "changedId"
                };

                SFProjectResource updatedResource = await env.Service.UpdateAsync(resource.Id, resource);

                Assert.That(updatedResource, Is.Not.Null);
                Assert.That(updatedResource.TranslateEnabled, Is.True);
                Assert.That(updatedResource.SourceParatextId, Is.EqualTo("changedId"));
                await env.EngineService.DidNotReceive().RemoveProjectAsync(Arg.Any<string>());
                await env.EngineService.Received().AddProjectAsync(Arg.Any<Project>());
                await env.SyncService.Received().SyncAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>());
            }
        }

        [Test]
        public async Task UpdateAsync_EnableChecking_Sync()
        {
            using (var env = new TestEnvironment())
            {
                env.SetUser(User01Id, SystemRoles.User);
                env.JsonApiContext.AttributesToUpdate.Returns(new Dictionary<AttrAttribute, object>
                    {
                        { env.GetAttribute("checking-enabled"), true }
                    });
                env.JsonApiContext.RelationshipsToUpdate.Returns(new Dictionary<RelationshipAttribute, object>());
                var resource = new SFProjectResource
                {
                    Id = "project01",
                    CheckingEnabled = true
                };

                SFProjectResource updatedResource = await env.Service.UpdateAsync(resource.Id, resource);

                Assert.That(updatedResource, Is.Not.Null);
                Assert.That(updatedResource.CheckingEnabled, Is.True);

                await env.EngineService.DidNotReceive().RemoveProjectAsync(Arg.Any<string>());
                await env.EngineService.DidNotReceive().AddProjectAsync(Arg.Any<Project>());
                await env.SyncService.Received().SyncAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>());
            }
        }

        [Test]
        public async Task GetAsync_UserRole()
        {
            using (var env = new TestEnvironment())
            {
                env.SetUser(User01Id, SystemRoles.User);
                env.JsonApiContext.QuerySet.Returns(new QuerySet());
                env.JsonApiContext.PageManager.Returns(new PageManager());

                SFProjectResource[] resources = (await env.Service.GetAsync()).ToArray();

                Assert.That(resources.Select(r => r.Id), Is.EquivalentTo(new[] { "project01", "project03" }));
            }
        }

        [Test]
        public async Task GetAsync_SystemAdminRole()
        {
            using (var env = new TestEnvironment())
            {
                env.SetUser(User01Id, SystemRoles.SystemAdmin);
                env.JsonApiContext.QuerySet.Returns(new QuerySet());
                env.JsonApiContext.PageManager.Returns(new PageManager());

                SFProjectResource[] resources = (await env.Service.GetAsync()).ToArray();

                Assert.That(resources.Select(r => r.Id), Is.EquivalentTo(new[]
                    {
                        "project01",
                        "project02",
                        "project03"
                    }));
            }
        }

        [Test]
        public async Task DeleteAsync()
        {
            using (var env = new TestEnvironment())
            {
                env.SetUser(User01Id, SystemRoles.User);
                env.CreateSiteDir();
                string syncDir = Path.Combine(TestEnvironment.SiteDir, "sync", "project01");
                Directory.CreateDirectory(syncDir);
                bool result = await env.Service.DeleteAsync("project01");

                Assert.That(result, Is.True);
                Assert.That(env.Entities.Contains("project01"), Is.False);
                await env.EngineService.Received().RemoveProjectAsync("project01");
                await env.RealtimeService.Received().DeleteProjectDocsAsync(SFRootDataTypes.Texts, "project01");
                await env.RealtimeService.Received().DeleteProjectDocsAsync(SFRootDataTypes.Questions, "project01");
                await env.RealtimeService.Received().DeleteProjectDocsAsync(SFRootDataTypes.Comments, "project01");
                await env.RealtimeService.Received().DeleteProjectDocsAsync(RootDataTypes.Projects, "project01");
                Assert.That(Directory.Exists(syncDir), Is.False);
            }
        }

        class TestEnvironment : ResourceServiceTestEnvironmentBase<SFProjectResource, SFProjectEntity>
        {
            public TestEnvironment()
                : base("projects")
            {
                EngineService = Substitute.For<IEngineService>();
                SyncService = Substitute.For<ISyncService>();
                SyncService.SyncAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>())
                    .Returns(Task.CompletedTask);
                RealtimeService = Substitute.For<IRealtimeService>();
                var projectDataDoc = Substitute.For<IDocument<SFProjectData>>();
                projectDataDoc.Data.Returns(new SFProjectData
                {
                    Texts =
                        {
                            new TextInfo
                            {
                                BookId = "MAT",
                                Name = "Matthew",
                                Chapters = { new Chapter { Number = 1, LastVerse = 3 } }
                            },
                            new TextInfo
                            {
                                BookId = "MRK",
                                Name = "Mark",
                                Chapters =
                                {
                                    new Chapter { Number = 1, LastVerse = 3 },
                                    new Chapter { Number = 2, LastVerse = 3 }
                                }
                            }
                        }
                });
                var conn = Substitute.For<IConnection>();
                conn.Get<SFProjectData>(RootDataTypes.Projects, "project01").Returns(projectDataDoc);
                RealtimeService.ConnectAsync().Returns(Task.FromResult(conn));
                Service = new SFProjectService(JsonApiContext, Mapper, UserAccessor, Entities, EngineService,
                    SiteOptions, SyncService, RealtimeService);
            }

            public SFProjectService Service { get; }
            public IEngineService EngineService { get; }
            public ISyncService SyncService { get; }
            public IRealtimeService RealtimeService { get; }

            protected override IEnumerable<SFProjectEntity> GetInitialData()
            {
                return new[]
                {
                    new SFProjectEntity
                    {
                        Id = "project01",
                        ProjectName = "project01",
                        TranslateEnabled = true,
                        SourceParatextId = "paratextId",
                        Users =
                        {
                            new SFProjectUserEntity
                            {
                                Id = "projectuser01",
                                UserRef = User01Id,
                                Role = SFProjectRoles.Administrator
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
                                Id = "projectuser03",
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
                                Id = "projectuser04",
                                UserRef = User01Id,
                                Role = SFProjectRoles.Administrator
                            },
                            new SFProjectUserEntity
                            {
                                Id = "projectuser05",
                                UserRef = User02Id,
                                Role = SFProjectRoles.Translator
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
