using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using NSubstitute;
using NUnit.Framework;
using SIL.Machine.WebApi;
using SIL.XForge.DataAccess;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Realtime;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services
{
    [TestFixture]
    public class MachineApiServiceTests
    {
        private const string Project01 = "project01";
        private const string Project02 = "project02";
        private const string TranslationEngine01 = "translationEngine01";
        private const string User01 = "user01";

        [Test]
        public async Task GetBuildAsync_NoBuildRunning()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.MachineBuildService
                .GetCurrentBuildAsync(TranslationEngine01, null, Arg.Any<CancellationToken>())
                .Returns(Task.FromResult<BuildDto>(null));

            // SUT
            BuildDto? actual = await env.Service.GetBuildAsync(User01, Project01, null, CancellationToken.None);

            Assert.IsNull(actual);
        }

        [Test]
        public void GetBuildAsync_NoPermission()
        {
            // Set up test environment
            var env = new TestEnvironment();

            // SUT
            Assert.ThrowsAsync<ForbiddenException>(
                () => env.Service.GetBuildAsync("invalid_user_id", Project01, null, CancellationToken.None)
            );
        }

        [Test]
        public void GetBuildAsync_NoProject()
        {
            // Set up test environment
            var env = new TestEnvironment();

            // SUT
            Assert.ThrowsAsync<DataNotFoundException>(
                () => env.Service.GetBuildAsync(User01, "invalid_project_id", null, CancellationToken.None)
            );
        }

        [Test]
        public async Task GetBuildAsync_Success()
        {
            // Set up test environment
            var env = new TestEnvironment();
            string message = "Finalizing";
            double percentCompleted = 0.95;
            int revision = 553;
            string state = "ACTIVE";
            env.MachineBuildService
                .GetCurrentBuildAsync(TranslationEngine01, null, Arg.Any<CancellationToken>())
                .Returns(
                    Task.FromResult(
                        new BuildDto
                        {
                            Href = "https://example.com",
                            Id = "buildId",
                            Engine = new ResourceDto { Id = "engineId", Href = "https://example.com", },
                            Message = message,
                            PercentCompleted = percentCompleted,
                            Revision = revision,
                            State = state,
                        }
                    )
                );

            // SUT
            BuildDto? actual = await env.Service.GetBuildAsync(User01, Project01, null, CancellationToken.None);

            Assert.IsNotNull(actual);
            Assert.AreEqual(message, actual.Message);
            Assert.AreEqual(percentCompleted, actual.PercentCompleted);
            Assert.AreEqual(revision, actual.Revision);
            Assert.AreEqual(state, actual.State);
            Assert.AreEqual(Project01, actual.Id);
            Assert.AreEqual(MachineApi.GetBuildHref(Project01), actual.Href);
            Assert.AreEqual(Project01, actual.Engine.Id);
            Assert.AreEqual(MachineApi.GetEngineHref(Project01), actual.Engine.Href);
        }

        [Test]
        public void GetEngineAsync_NoPermission()
        {
            // Set up test environment
            var env = new TestEnvironment();

            // SUT
            Assert.ThrowsAsync<ForbiddenException>(
                () => env.Service.GetEngineAsync("invalid_user_id", Project01, CancellationToken.None)
            );
        }

        [Test]
        public void GetEngineAsync_NoProject()
        {
            // Set up test environment
            var env = new TestEnvironment();

            // SUT
            Assert.ThrowsAsync<DataNotFoundException>(
                () => env.Service.GetEngineAsync(User01, "invalid_project_id", CancellationToken.None)
            );
        }

        [Test]
        public async Task GetEngineAsync_Success()
        {
            // Set up test environment
            var env = new TestEnvironment();
            string sourceLanguageTag = "en_US";
            string targetLanguageTag = "en_NZ";
            int confidence = 100;
            int corpusSize = 472;
            env.MachineTranslationService
                .GetTranslationEngineAsync(TranslationEngine01, Arg.Any<CancellationToken>())
                .Returns(
                    Task.FromResult(
                        new MachineApiTranslationEngine
                        {
                            Confidence = confidence,
                            CorpusSize = corpusSize,
                            Href = "https://example.com",
                            Id = Project01,
                            IsBuilding = true,
                            ModelRevision = 1,
                            Name = "my_translation_engine",
                            SourceLanguageTag = sourceLanguageTag,
                            TargetLanguageTag = targetLanguageTag,
                            Type = "SmtTransfer",
                        }
                    )
                );

            // SUT
            EngineDto actual = await env.Service.GetEngineAsync(User01, Project01, CancellationToken.None);

            Assert.AreEqual(confidence, actual.Confidence);
            Assert.AreEqual(corpusSize, actual.TrainedSegmentCount);
            Assert.AreEqual(sourceLanguageTag, actual.SourceLanguageTag);
            Assert.AreEqual(targetLanguageTag, actual.TargetLanguageTag);
            Assert.IsFalse(actual.IsShared);
            Assert.AreEqual(MachineApi.GetEngineHref(Project01), actual.Href);
            Assert.AreEqual(1, actual.Projects.Length);
            Assert.AreEqual(Project01, actual.Projects.First().Id);
            Assert.AreEqual(MachineApi.GetEngineHref(Project01), actual.Projects.First().Href);
        }

        [Test]
        public void GetWordGraphAsync_NoPermission()
        {
            // Set up test environment
            var env = new TestEnvironment();

            // SUT
            Assert.ThrowsAsync<ForbiddenException>(
                () =>
                    env.Service.GetWordGraphAsync(
                        "invalid_user_id",
                        Project01,
                        Array.Empty<string>(),
                        CancellationToken.None
                    )
            );
        }

        [Test]
        public void GetWordGraphAsync_NoProject()
        {
            // Set up test environment
            var env = new TestEnvironment();

            // SUT
            Assert.ThrowsAsync<DataNotFoundException>(
                () =>
                    env.Service.GetWordGraphAsync(
                        User01,
                        "invalid_project_id",
                        Array.Empty<string>(),
                        CancellationToken.None
                    )
            );
        }

        [Test]
        public async Task GetWordGraphAsync_Success()
        {
            // Set up test environment
            var env = new TestEnvironment();
            float initialStateScore = -91.43696f;
            env.MachineTranslationService
                .GetWordGraphAsync(TranslationEngine01, Array.Empty<string>(), Arg.Any<CancellationToken>())
                .Returns(
                    Task.FromResult(
                        new WordGraphDto
                        {
                            Arcs = new[] { new WordGraphArcDto() },
                            FinalStates = new[] { 1 },
                            InitialStateScore = initialStateScore,
                        }
                    )
                );

            // SUT
            WordGraphDto actual = await env.Service.GetWordGraphAsync(
                User01,
                Project01,
                Array.Empty<string>(),
                CancellationToken.None
            );

            Assert.IsNotNull(actual);
            Assert.AreEqual(initialStateScore, actual.InitialStateScore);
            Assert.AreEqual(1, actual.Arcs.Length);
            Assert.AreEqual(1, actual.FinalStates.Length);
        }

        [Test]
        public void StartBuildAsync_NoPermission()
        {
            // Set up test environment
            var env = new TestEnvironment();

            // SUT
            Assert.ThrowsAsync<ForbiddenException>(
                () => env.Service.StartBuildAsync("invalid_user_id", Project01, CancellationToken.None)
            );
        }

        [Test]
        public void StartBuildAsync_NoProject()
        {
            // Set up test environment
            var env = new TestEnvironment();

            // SUT
            Assert.ThrowsAsync<DataNotFoundException>(
                () => env.Service.StartBuildAsync(User01, "invalid_project_id", CancellationToken.None)
            );
        }

        [Test]
        public async Task StartBuildAsync_Success()
        {
            // Set up test environment
            var env = new TestEnvironment();
            string message = "Training language model";
            double percentCompleted = 0.01;
            int revision = 2;
            string state = "ACTIVE";
            env.MachineBuildService
                .StartBuildAsync(TranslationEngine01, Arg.Any<CancellationToken>())
                .Returns(
                    Task.FromResult(
                        new BuildDto
                        {
                            Href = "https://example.com",
                            Id = "buildId",
                            Engine = new ResourceDto { Id = "engineId", Href = "https://example.com", },
                            Message = message,
                            PercentCompleted = percentCompleted,
                            Revision = revision,
                            State = state,
                        }
                    )
                );

            // SUT
            BuildDto actual = await env.Service.StartBuildAsync(User01, Project01, CancellationToken.None);

            Assert.AreEqual(message, actual.Message);
            Assert.AreEqual(percentCompleted, actual.PercentCompleted);
            Assert.AreEqual(revision, actual.Revision);
            Assert.AreEqual(state, actual.State);
            Assert.AreEqual(Project01, actual.Id);
            Assert.AreEqual(MachineApi.GetBuildHref(Project01), actual.Href);
            Assert.AreEqual(Project01, actual.Engine.Id);
            Assert.AreEqual(MachineApi.GetEngineHref(Project01), actual.Engine.Href);
        }

        [Test]
        public void TrainSegmentAsync_NoPermission()
        {
            // Set up test environment
            var env = new TestEnvironment();

            // SUT
            Assert.ThrowsAsync<ForbiddenException>(
                () =>
                    env.Service.TrainSegmentAsync(
                        "invalid_user_id",
                        Project01,
                        new SegmentPairDto(),
                        CancellationToken.None
                    )
            );
        }

        [Test]
        public void TrainSegmentAsync_NoProject()
        {
            // Set up test environment
            var env = new TestEnvironment();

            // SUT
            Assert.ThrowsAsync<DataNotFoundException>(
                () =>
                    env.Service.TrainSegmentAsync(
                        User01,
                        "invalid_project_id",
                        new SegmentPairDto(),
                        CancellationToken.None
                    )
            );
        }

        [Test]
        public async Task TrainSegmentAsync_Success()
        {
            // Set up test environment
            var env = new TestEnvironment();
            var segmentPair = new SegmentPairDto();

            // SUT
            await env.Service.TrainSegmentAsync(User01, Project01, segmentPair, CancellationToken.None);

            await env.MachineTranslationService
                .Received(1)
                .TrainSegmentAsync(TranslationEngine01, segmentPair, CancellationToken.None);
        }

        private class TestEnvironment
        {
            public TestEnvironment()
            {
                MachineBuildService = Substitute.For<IMachineBuildService>();
                MachineTranslationService = Substitute.For<IMachineTranslationService>();
                var projectSecrets = new MemoryRepository<SFProjectSecret>(
                    new[]
                    {
                        new SFProjectSecret
                        {
                            Id = Project01,
                            MachineData = new MachineData { TranslationEngineId = TranslationEngine01, },
                        },
                        new SFProjectSecret { Id = Project02 },
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
                                UserRoles = new Dictionary<string, string> { { User01, SFProjectRole.Administrator }, },
                            },
                            new SFProject { Id = Project02, },
                        }
                    )
                );

                Service = new MachineApiService(
                    MachineBuildService,
                    MachineTranslationService,
                    projectSecrets,
                    realtimeService
                );
            }

            public IMachineBuildService MachineBuildService { get; }
            public IMachineTranslationService MachineTranslationService { get; }
            public MachineApiService Service { get; }
        }
    }
}
