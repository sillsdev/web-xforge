using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using NSubstitute;
using NUnit.Framework;
using SIL.Machine.Corpora;
using SIL.Machine.WebApi.Services;
using SIL.XForge.DataAccess;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Realtime;
using MachineProject = SIL.Machine.WebApi.Models.Project;

namespace SIL.XForge.Scripture.Services
{
    [TestFixture]
    public class MachineProjectServiceTests
    {
        private static readonly string Project01 = "project01";
        private static readonly string Project02 = "project02";
        private static readonly string Project03 = "project03";
        private const string User01 = "user01";
        private static readonly string Corpus01 = "corpus01";
        private static readonly string File01 = "file01";
        private static readonly string File02 = "file02";

        [Test]
        public async Task AddProjectAsync_ExecutesInMemoryMachineAndMachineApi()
        {
            // Set up a mock Machine API
            string translationEngineId = "633711040935fe633f927c80";
            var response =
                $"{{\"id\": \"{translationEngineId}\",\"href\":\"/translation-engines/{translationEngineId}\"}}";
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.OK);
            var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost") };

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            await env.Service.AddProjectAsync(User01, Project01, CancellationToken.None);

            await env.EngineService.Received().AddProjectAsync(Arg.Any<MachineProject>());
            Assert.AreEqual(translationEngineId, env.ProjectSecrets.Get(Project01).MachineData.TranslationEngineId);
            Assert.AreEqual(1, handler.NumberOfCalls);
        }

        [Test]
        public async Task BuildProjectAsync_CallsMachineApiIfTranslationEngineIdPresent()
        {
            // Set up a mock Machine API
            var response = $"{{\"id\": \"633711040935fe633f927c80\",\"state\":\"pending\"}}";
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.OK);
            var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost") };

            // Set up test environment
            var env = new TestEnvironment(httpClient);
            env.TextCorpusFactory
                .CreateAsync(Arg.Any<IEnumerable<string>>(), TextCorpusType.Source)
                .Returns(
                    Task.FromResult<ITextCorpus>(
                        new MockTextCorpus
                        {
                            Texts = new[]
                            {
                                new MockText
                                {
                                    Id = "textId",
                                    Segments = new List<TextSegment>
                                    {
                                        new TextSegment(
                                            "textId",
                                            "segRef",
                                            new string[] { "segment01" },
                                            false,
                                            false,
                                            false,
                                            false
                                        ),
                                    },
                                },
                            },
                        }
                    )
                );

            // SUT
            await env.Service.BuildProjectAsync(User01, Project02, true, CancellationToken.None);

            Assert.AreEqual(1, handler.NumberOfCalls);
        }

        [Test]
        public async Task BuildProjectAsync_DoesNotCallMachineApiIfNoTextChanges()
        {
            // Set up a mock Machine API
            var response = $"{{\"id\": \"633711040935fe633f927c80\",\"state\":\"pending\"}}";
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.OK);
            var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost") };

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            await env.Service.BuildProjectAsync(User01, Project02, true, CancellationToken.None);

            Assert.AreEqual(0, handler.NumberOfCalls);
        }

        [Test]
        public async Task BuildProjectAsync_DoesNotCallMachineApiIfNoTranslationEngineId()
        {
            // Set up a mock Machine API
            var handler = new MockHttpMessageHandler(string.Empty, HttpStatusCode.OK);
            var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost") };

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            await env.Service.BuildProjectAsync(User01, Project01, true, CancellationToken.None);

            Assert.AreEqual(0, handler.NumberOfCalls);
        }

        [Test]
        public async Task BuildProjectAsync_DoesNotExecuteInMemoryMachine()
        {
            // Set up test environment
            var env = new TestEnvironment();

            // SUT
            await env.Service.BuildProjectAsync(User01, Project01, false, CancellationToken.None);

            await env.EngineService.DidNotReceive().StartBuildByProjectIdAsync(Project01);
        }

        [Test]
        public async Task BuildProjectAsync_ExecutesInMemoryMachine()
        {
            // Set up test environment
            var env = new TestEnvironment();

            // SUT
            await env.Service.BuildProjectAsync(User01, Project01, true, CancellationToken.None);

            await env.EngineService.Received().StartBuildByProjectIdAsync(Project01);
        }

        [Test]
        public async Task RemoveProjectAsync_CallsMachineApiIfTranslationEngineIdPresent()
        {
            // Set up a mock Machine API
            var handler = new MockHttpMessageHandler(string.Empty, HttpStatusCode.OK);
            var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost") };

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            await env.Service.RemoveProjectAsync(User01, Project02, CancellationToken.None);

            // Ensure the the web API was called one, and the corpus and any files are deleted
            Assert.AreEqual(1, handler.NumberOfCalls);
            await env.MachineCorporaService.Received(1).DeleteCorpusAsync(Corpus01, CancellationToken.None);
            await env.MachineCorporaService.Received(1).DeleteCorpusFileAsync(Corpus01, File01, CancellationToken.None);
            await env.MachineCorporaService.Received(1).DeleteCorpusFileAsync(Corpus01, File02, CancellationToken.None);
        }

        [Test]
        public async Task RemoveProjectAsync_DoesNotCallMachineApiIfNoTranslationEngineId()
        {
            // Set up a mock Machine API
            var handler = new MockHttpMessageHandler(string.Empty, HttpStatusCode.OK);
            var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost") };

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            await env.Service.RemoveProjectAsync(User01, Project01, CancellationToken.None);

            Assert.AreEqual(0, handler.NumberOfCalls);
        }

        [Test]
        public async Task RemoveProjectAsync_ExecutesInMemoryMachine()
        {
            // Set up test environment
            var env = new TestEnvironment();

            // SUT
            await env.Service.RemoveProjectAsync(User01, Project01, CancellationToken.None);

            await env.EngineService.Received().RemoveProjectAsync(Project01);
        }

        private class TestEnvironment
        {
            public TestEnvironment(HttpClient httpClient = default)
            {
                EngineService = Substitute.For<IEngineService>();
                var httpClientFactory = Substitute.For<IHttpClientFactory>();
                httpClientFactory.CreateClient(Arg.Any<string>()).Returns(httpClient);
                var logger = new MockLogger<MachineProjectService>();
                MachineCorporaService = Substitute.For<IMachineCorporaService>();
                TextCorpusFactory = Substitute.For<ITextCorpusFactory>();

                ProjectSecrets = new MemoryRepository<SFProjectSecret>(
                    new[]
                    {
                        new SFProjectSecret { Id = Project01 },
                        new SFProjectSecret
                        {
                            Id = Project02,
                            MachineData = new MachineData
                            {
                                TranslationEngineId = Project02,
                                CorpusId = Corpus01,
                                Files = new List<MachineCorpusFile>
                                {
                                    new MachineCorpusFile { FileId = File01 },
                                    new MachineCorpusFile { FileId = File02 },
                                },
                            },
                        },
                        new SFProjectSecret { Id = Project03 },
                    }
                );

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
                                    Source = new TranslateSource { ProjectRef = Project02 },
                                },
                            },
                            new SFProject
                            {
                                Id = Project02,
                                Name = "project02",
                                ShortName = "P02",
                                CheckingConfig = new CheckingConfig { ShareEnabled = false },
                                UserRoles = new Dictionary<string, string>(),
                                TranslateConfig = new TranslateConfig
                                {
                                    TranslationSuggestionsEnabled = true,
                                    Source = new TranslateSource { ProjectRef = Project03 },
                                },
                            },
                            new SFProject
                            {
                                Id = Project03,
                                Name = "project03",
                                ShortName = "P03",
                                CheckingConfig = new CheckingConfig { ShareEnabled = false },
                                UserRoles = new Dictionary<string, string>(),
                            },
                        }
                    )
                );

                Service = new MachineProjectService(
                    EngineService,
                    httpClientFactory,
                    logger,
                    MachineCorporaService,
                    ProjectSecrets,
                    realtimeService,
                    TextCorpusFactory
                );
            }

            public MachineProjectService Service { get; }
            public IEngineService EngineService { get; }
            public IMachineCorporaService MachineCorporaService { get; }
            public MemoryRepository<SFProjectSecret> ProjectSecrets { get; }
            public ITextCorpusFactory TextCorpusFactory { get; }
        }
    }
}
