using System.Collections.Generic;
using System.Threading.Tasks;
using NSubstitute;
using NUnit.Framework;
using SIL.Machine.WebApi.Services;
using SIL.XForge.DataAccess;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Realtime;
using MachineProject = SIL.Machine.WebApi.Models.Project;

namespace SIL.XForge.Scripture.Services
{
    [TestFixture]
    public class MachineServiceTests
    {
        private static readonly string Project01 = "project01";
        private static readonly string Project02 = "project02";
        private const string User01 = "user01";

        [Test]
        public async Task AddProjectAsync_ExecutesInMemoryMachine()
        {
            // Set up test environment
            var env = new TestEnvironment();

            // SUT
            await env.Service.AddProjectAsync(User01, Project01);

            await env.EngineService.Received().AddProjectAsync(Arg.Any<MachineProject>());
        }

        [Test]
        public async Task BuildProjectAsync_ExecutesInMemoryMachine()
        {
            // Set up test environment
            var env = new TestEnvironment();

            // SUT
            await env.Service.BuildProjectAsync(User01, Project01);

            await env.EngineService.Received().StartBuildByProjectIdAsync(Project01);
        }

        [Test]
        public async Task RemoveProjectAsync_ExecutesInMemoryMachine()
        {
            // Set up test environment
            var env = new TestEnvironment();

            // SUT
            await env.Service.RemoveProjectAsync(User01, Project01);

            await env.EngineService.Received().RemoveProjectAsync(Project01);
        }

        private class TestEnvironment
        {
            public TestEnvironment()
            {
                EngineService = Substitute.For<IEngineService>();
                var realtimeService = new SFMemoryRealtimeService();

                realtimeService.AddRepository(
                    "sf_projects",
                    OTType.Json0,
                    new MemoryRepository<SFProject>(
                        new[]
                        {
                            new SFProject
                            {
                                Id = Project01,
                                Name = "project01",
                                ShortName = "P01",
                                CheckingConfig = new CheckingConfig { ShareEnabled = false },
                                UserRoles = new Dictionary<string, string>(),
                                TranslateConfig = new TranslateConfig
                                {
                                    TranslationSuggestionsEnabled = true,
                                    Source = new TranslateSource { ProjectRef = Project02 }
                                },
                            },
                            new SFProject
                            {
                                Id = Project02,
                                Name = "project02",
                                ShortName = "P02",
                                CheckingConfig = new CheckingConfig { ShareEnabled = false },
                                UserRoles = new Dictionary<string, string>(),
                            },
                        }
                    )
                );

                Service = new MachineService(EngineService, realtimeService);
            }

            public MachineService Service { get; }
            public IEngineService EngineService { get; }
        }
    }
}
