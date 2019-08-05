using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
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

namespace SIL.XForge.Scripture.Services
{
    [TestFixture]
    public class SFProjectServiceTests
    {
        private const string Project01 = "project01";
        private const string Project02 = "project02";
        private const string Project03 = "project03";
        private const string User01 = "user01";
        private const string User02 = "user02";
        private const string SiteId = "xf";

        [Test]
        public async Task UpdateSettingsAsync_ChangeSourceProject_RecreateMachineProjectAndSync()
        {
            var env = new TestEnvironment();

            await env.Service.UpdateSettingsAsync(User01, Project01,
                new SFProjectSettings { SourceParatextId = "changedId" });

            SFProject project = env.GetProject("project01");
            Assert.That(project.SourceParatextId, Is.EqualTo("changedId"));

            await env.EngineService.Received().RemoveProjectAsync(Arg.Any<string>());
            await env.EngineService.Received().AddProjectAsync(Arg.Any<Machine.WebApi.Models.Project>());
            await env.SyncService.Received().SyncAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>());
        }

        [Test]
        public async Task UpdateSettingsAsync_EnableTranslate_CreateMachineProjectAndSync()
        {
            var env = new TestEnvironment();

            await env.Service.UpdateSettingsAsync(User01, Project01,
                new SFProjectSettings { TranslateEnabled = true, SourceParatextId = "changedId" });

            SFProject project = env.GetProject(Project01);
            Assert.That(project.TranslateEnabled, Is.True);
            Assert.That(project.SourceParatextId, Is.EqualTo("changedId"));

            await env.EngineService.DidNotReceive().RemoveProjectAsync(Arg.Any<string>());
            await env.EngineService.Received().AddProjectAsync(Arg.Any<Machine.WebApi.Models.Project>());
            await env.SyncService.Received().SyncAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>());
        }

        [Test]
        public async Task UpdateSettingsAsync_EnableChecking_Sync()
        {
            var env = new TestEnvironment();

            await env.Service.UpdateSettingsAsync(User01, Project01, new SFProjectSettings { CheckingEnabled = true });

            SFProject project = env.GetProject(Project01);
            Assert.That(project.CheckingEnabled, Is.True);

            await env.EngineService.DidNotReceive().RemoveProjectAsync(Arg.Any<string>());
            await env.EngineService.DidNotReceive().AddProjectAsync(Arg.Any<Machine.WebApi.Models.Project>());
            await env.SyncService.Received().SyncAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>());
        }

        [Test]
        public async Task UpdateSettingsAsync_EnableSharing_NoSync()
        {
            var env = new TestEnvironment();

            await env.Service.UpdateSettingsAsync(User01, Project01, new SFProjectSettings { ShareEnabled = true });

            SFProject project = env.GetProject(Project01);
            Assert.That(project.ShareEnabled, Is.True);

            await env.EngineService.DidNotReceive().RemoveProjectAsync(Arg.Any<string>());
            await env.EngineService.DidNotReceive().AddProjectAsync(Arg.Any<Machine.WebApi.Models.Project>());
            await env.SyncService.DidNotReceive().SyncAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>());
        }

        [Test]
        public async Task DeleteAsync()
        {
            var env = new TestEnvironment();
            string syncDir = Path.Combine("xforge", "sync", Project01);
            env.FileSystemService.DirectoryExists(syncDir).Returns(true);
            await env.Service.DeleteProjectAsync(User01, Project01);

            Assert.That(env.ContainsProject(Project01), Is.False);
            User user = env.GetUser(User01);
            Assert.That(user.Sites[SiteId].Projects, Does.Not.Contain(Project01));
            await env.EngineService.Received().RemoveProjectAsync(Project01);
            env.FileSystemService.Received().DeleteDirectory(syncDir);
            Assert.That(env.ProjectSecrets.Contains(Project01), Is.False);
        }

        private class TestEnvironment
        {
            public TestEnvironment()
            {
                RealtimeService = new SFMemoryRealtimeService();
                RealtimeService.AddRepository(RootDataTypes.Users, OTType.Json0, new MemoryRepository<User>(new[]
                {
                    new User
                    {
                        Id = User01,
                        Sites = new Dictionary<string, Site>
                        {
                            { SiteId, new Site { Projects = { Project01, Project03 } } }
                        }
                    },
                    new User
                    {
                        Id = User02,
                        Sites = new Dictionary<string, Site>
                        {
                            { SiteId, new Site { Projects = { Project02, Project03 } } }
                        }
                    }
                }));
                RealtimeService.AddRepository(RootDataTypes.Projects, OTType.Json0, new MemoryRepository<SFProject>(
                    new[]
                    {
                        new SFProject
                        {
                            Id = Project01,
                            ProjectName = "project01",
                            TranslateEnabled = true,
                            SourceParatextId = "paratextId",
                            ShareEnabled = false,
                            UserRoles = new Dictionary<string, string>
                            {
                                { User01, SFProjectRoles.Administrator }
                            },
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
                        },
                        new SFProject
                        {
                            Id = Project02,
                            ProjectName = "project02",
                            UserRoles =
                            {
                                { User02, SFProjectRoles.Administrator }
                            }
                        },
                        new SFProject
                        {
                            Id = Project03,
                            ProjectName = "project03",
                            UserRoles =
                            {
                                { User01, SFProjectRoles.Administrator },
                                { User02, SFProjectRoles.Translator }
                            }
                        }
                    }));
                RealtimeService.AddRepository(SFRootDataTypes.ProjectUserConfigs, OTType.Json0,
                    new MemoryRepository<SFProjectUserConfig>(new[]
                    {
                        new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId(Project01, User01) },
                        new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId(Project02, User02) },
                        new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId(Project03, User01) },
                        new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId(Project03, User02) }
                    }));
                var siteOptions = Substitute.For<IOptions<SiteOptions>>();
                siteOptions.Value.Returns(new SiteOptions
                {
                    Id = SiteId,
                    Name = "xForge",
                    Origin = new Uri("http://localhost"),
                    SiteDir = "xforge"
                });
                var emailService = Substitute.For<IEmailService>();
                ProjectSecrets = new MemoryRepository<SFProjectSecret>(new[]
                {
                    new SFProjectSecret { Id = Project01 },
                    new SFProjectSecret { Id = Project02 },
                    new SFProjectSecret { Id = Project03 },
                });
                var securityService = Substitute.For<ISecurityService>();
                EngineService = Substitute.For<IEngineService>();
                SyncService = Substitute.For<ISyncService>();
                SyncService.SyncAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>())
                    .Returns(Task.CompletedTask);
                var paratextService = Substitute.For<IParatextService>();
                var userSecrets = new MemoryRepository<UserSecret>(new[]
                {
                    new UserSecret { Id = User01 },
                    new UserSecret { Id = User02 }
                });
                var translateMetrics = new MemoryRepository<TranslateMetrics>();
                FileSystemService = Substitute.For<IFileSystemService>();
                Service = new SFProjectService(RealtimeService, siteOptions, emailService, ProjectSecrets,
                    securityService, EngineService, SyncService, paratextService, userSecrets, translateMetrics,
                    FileSystemService);
            }

            public SFProjectService Service { get; }
            public IEngineService EngineService { get; }
            public ISyncService SyncService { get; }
            public SFMemoryRealtimeService RealtimeService { get; }
            public IFileSystemService FileSystemService { get; }
            public MemoryRepository<SFProjectSecret> ProjectSecrets { get; }

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
