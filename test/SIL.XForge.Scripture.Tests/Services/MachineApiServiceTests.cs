using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using Microsoft.FeatureManagement;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using NUnit.Framework;
using Polly.CircuitBreaker;
using SIL.Machine.Annotations;
using SIL.Machine.Translation;
using SIL.Machine.WebApi;
using SIL.Machine.WebApi.Configuration;
using SIL.Machine.WebApi.DataAccess;
using SIL.Machine.WebApi.Models;
using SIL.Machine.WebApi.Services;
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
        private const string Project03 = "project03";
        private const string Build01 = "build01";
        private const string TranslationEngine01 = "translationEngine01";
        private const string User01 = "user01";

        [Test]
        public async Task GetBuildAsync_InProcessNoRevisionNoBuildRunning()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineApi).Returns(Task.FromResult(false));
            env.Builds
                .GetByLocatorAsync(BuildLocatorType.Id, Build01, CancellationToken.None)
                .Returns(Task.FromResult<Build>(null));

            // SUT
            BuildDto? actual = await env.Service.GetBuildAsync(
                User01,
                Project01,
                Build01,
                minRevision: null,
                CancellationToken.None
            );

            Assert.IsNull(actual);
        }

        [Test]
        public void GetBuildAsync_InProcessSpecificRevisionBuildEnded()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineApi).Returns(Task.FromResult(false));

            // NOTE: It is not possible to test No Build Running, as the Subscription Change cannot be modified
            env.Builds
                .SubscribeAsync(Build01, CancellationToken.None)
                .Returns(Task.FromResult(new Subscription<Build>(Build01, null, _ => { })));

            // SUT
            Assert.ThrowsAsync<DataNotFoundException>(
                () => env.Service.GetBuildAsync(User01, Project01, Build01, minRevision: 1, CancellationToken.None)
            );
        }

        [Test]
        public void GetBuildAsync_MachineApiBuildEnded()
        {
            // Set up test environment
            var env = new TestEnvironment();
            int minRevision = 0;
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));
            env.MachineBuildService
                .GetBuildAsync(TranslationEngine01, Build01, minRevision, CancellationToken.None)
                .Throws(new DataNotFoundException("Entity Deleted"));

            // SUT
            Assert.ThrowsAsync<DataNotFoundException>(
                () => env.Service.GetBuildAsync(User01, Project01, Build01, minRevision, CancellationToken.None)
            );
        }

        [Test]
        public async Task GetBuildAsync_MachineApiNoBuildRunning()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));
            env.MachineBuildService
                .GetBuildAsync(TranslationEngine01, Build01, null, CancellationToken.None)
                .Returns(Task.FromResult<BuildDto>(null));

            // SUT
            BuildDto? actual = await env.Service.GetBuildAsync(
                User01,
                Project01,
                Build01,
                minRevision: null,
                CancellationToken.None
            );

            Assert.IsNull(actual);
        }

        [Test]
        public void GetBuildAsync_NoPermission()
        {
            // Set up test environment
            var env = new TestEnvironment();

            // SUT
            Assert.ThrowsAsync<ForbiddenException>(
                () =>
                    env.Service.GetBuildAsync(
                        "invalid_user_id",
                        Project01,
                        Build01,
                        minRevision: null,
                        CancellationToken.None
                    )
            );
        }

        [Test]
        public void GetBuildAsync_NoProject()
        {
            // Set up test environment
            var env = new TestEnvironment();

            // SUT
            Assert.ThrowsAsync<DataNotFoundException>(
                () =>
                    env.Service.GetBuildAsync(
                        User01,
                        "invalid_project_id",
                        Build01,
                        minRevision: null,
                        CancellationToken.None
                    )
            );
        }

        [Test]
        public void GetBuildAsync_MachineApiNoTranslationEngine()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

            // SUT
            Assert.ThrowsAsync<DataNotFoundException>(
                () => env.Service.GetBuildAsync(User01, Project03, Build01, minRevision: null, CancellationToken.None)
            );
        }

        [Test]
        public async Task GetBuildAsync_InProcessSuccess()
        {
            // Set up test environment
            var env = new TestEnvironment();
            string buildDtoId = $"{Project01}.{Build01}";
            string message = "Finalizing";
            double percentCompleted = 0.95;
            int revision = 553;
            string state = "ACTIVE";
            env.Builds
                .GetByLocatorAsync(BuildLocatorType.Id, Build01, CancellationToken.None)
                .Returns(
                    Task.FromResult(
                        new Build
                        {
                            Id = Build01,
                            Message = message,
                            PercentCompleted = percentCompleted,
                            Revision = revision,
                            State = state,
                        }
                    )
                );
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineApi).Returns(Task.FromResult(false));

            // SUT
            BuildDto? actual = await env.Service.GetBuildAsync(
                User01,
                Project01,
                Build01,
                minRevision: null,
                CancellationToken.None
            );

            Assert.IsNotNull(actual);
            Assert.AreEqual(message, actual.Message);
            Assert.AreEqual(percentCompleted, actual.PercentCompleted);
            Assert.AreEqual(revision, actual.Revision);
            Assert.AreEqual(state, actual.State);
            Assert.AreEqual(buildDtoId, actual.Id);
            Assert.AreEqual(MachineApi.GetBuildHref(Project01, Build01), actual.Href);
            Assert.AreEqual(Project01, actual.Engine.Id);
            Assert.AreEqual(MachineApi.GetEngineHref(Project01), actual.Engine.Href);
        }

        [Test]
        public async Task GetBuildAsync_MachineApiSuccess()
        {
            // Set up test environment
            var env = new TestEnvironment();
            string buildDtoId = $"{Project01}.{Build01}";
            string message = "Finalizing";
            double percentCompleted = 0.95;
            int revision = 553;
            string state = "ACTIVE";
            env.MachineBuildService
                .GetBuildAsync(TranslationEngine01, Build01, minRevision: null, CancellationToken.None)
                .Returns(
                    Task.FromResult(
                        new BuildDto
                        {
                            Href = "https://example.com",
                            Id = Build01,
                            Engine = new ResourceDto { Id = "engineId", Href = "https://example.com" },
                            Message = message,
                            PercentCompleted = percentCompleted,
                            Revision = revision,
                            State = state,
                        }
                    )
                );
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

            // SUT
            BuildDto? actual = await env.Service.GetBuildAsync(
                User01,
                Project01,
                Build01,
                minRevision: null,
                CancellationToken.None
            );

            Assert.IsNotNull(actual);
            Assert.AreEqual(message, actual.Message);
            Assert.AreEqual(percentCompleted, actual.PercentCompleted);
            Assert.AreEqual(revision, actual.Revision);
            Assert.AreEqual(state, actual.State);
            Assert.AreEqual(buildDtoId, actual.Id);
            Assert.AreEqual(MachineApi.GetBuildHref(Project01, Build01), actual.Href);
            Assert.AreEqual(Project01, actual.Engine.Id);
            Assert.AreEqual(MachineApi.GetEngineHref(Project01), actual.Engine.Href);
        }

        [Test]
        public async Task GetBuildAsync_ExecutesOnlyInProcessIfBothEnabled()
        {
            // Set up test environment
            var env = new TestEnvironment();

            // SUT
            _ = await env.Service.GetBuildAsync(User01, Project01, Build01, minRevision: null, CancellationToken.None);

            await env.Builds.Received(1).GetByLocatorAsync(BuildLocatorType.Id, Build01, CancellationToken.None);
            await env.MachineBuildService
                .DidNotReceiveWithAnyArgs()
                .GetBuildAsync(TranslationEngine01, Build01, minRevision: null, CancellationToken.None);
        }

        [Test]
        public async Task GetCurrentBuildAsync_InProcessNoRevisionNoBuildRunning()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineApi).Returns(Task.FromResult(false));
            env.Builds
                .GetByLocatorAsync(BuildLocatorType.Engine, TranslationEngine01, CancellationToken.None)
                .Returns(Task.FromResult<Build>(null));

            // SUT
            BuildDto? actual = await env.Service.GetCurrentBuildAsync(
                User01,
                Project01,
                minRevision: null,
                CancellationToken.None
            );

            Assert.IsNull(actual);
        }

        [Test]
        public void GetCurrentBuildAsync_InProcessSpecificRevisionBuildEnded()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineApi).Returns(Task.FromResult(false));

            // NOTE: It is not possible to test No Build Running, as the Subscription Change cannot be modified
            env.Builds
                .SubscribeByEngineIdAsync(TranslationEngine01, CancellationToken.None)
                .Returns(Task.FromResult(new Subscription<Build>(TranslationEngine01, null, _ => { })));

            // SUT
            Assert.ThrowsAsync<DataNotFoundException>(
                () => env.Service.GetCurrentBuildAsync(User01, Project01, minRevision: 1, CancellationToken.None)
            );
        }

        [Test]
        public void GetCurrentBuildAsync_MachineApiBuildEnded()
        {
            // Set up test environment
            var env = new TestEnvironment();
            int minRevision = 0;
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));
            env.MachineBuildService
                .GetCurrentBuildAsync(TranslationEngine01, minRevision, CancellationToken.None)
                .Throws(new DataNotFoundException("Entity Deleted"));

            // SUT
            Assert.ThrowsAsync<DataNotFoundException>(
                () => env.Service.GetCurrentBuildAsync(User01, Project01, minRevision, CancellationToken.None)
            );
        }

        [Test]
        public async Task GetCurrentBuildAsync_MachineApiNoBuildRunning()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));
            env.MachineBuildService
                .GetCurrentBuildAsync(TranslationEngine01, null, CancellationToken.None)
                .Returns(Task.FromResult<BuildDto>(null));

            // SUT
            BuildDto? actual = await env.Service.GetCurrentBuildAsync(
                User01,
                Project01,
                minRevision: null,
                CancellationToken.None
            );

            Assert.IsNull(actual);
        }

        [Test]
        public void GetCurrentBuildAsync_NoPermission()
        {
            // Set up test environment
            var env = new TestEnvironment();

            // SUT
            Assert.ThrowsAsync<ForbiddenException>(
                () =>
                    env.Service.GetCurrentBuildAsync(
                        "invalid_user_id",
                        Project01,
                        minRevision: null,
                        CancellationToken.None
                    )
            );
        }

        [Test]
        public void GetCurrentBuildAsync_NoProject()
        {
            // Set up test environment
            var env = new TestEnvironment();

            // SUT
            Assert.ThrowsAsync<DataNotFoundException>(
                () =>
                    env.Service.GetCurrentBuildAsync(
                        User01,
                        "invalid_project_id",
                        minRevision: null,
                        CancellationToken.None
                    )
            );
        }

        [Test]
        public void GetCurrentBuildAsync_InProcessNoEngine()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineApi).Returns(Task.FromResult(false));
            env.Engines
                .GetByLocatorAsync(EngineLocatorType.Project, Project01, CancellationToken.None)
                .Returns(Task.FromResult<Engine>(null));

            // SUT
            Assert.ThrowsAsync<DataNotFoundException>(
                () => env.Service.GetCurrentBuildAsync(User01, Project01, minRevision: null, CancellationToken.None)
            );
        }

        [Test]
        public void GetCurrentBuildAsync_MachineApiNoTranslationEngine()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

            // SUT
            Assert.ThrowsAsync<DataNotFoundException>(
                () => env.Service.GetCurrentBuildAsync(User01, Project03, minRevision: null, CancellationToken.None)
            );
        }

        [Test]
        public async Task GetCurrentBuildAsync_InProcessSuccess()
        {
            // Set up test environment
            var env = new TestEnvironment();
            string buildDtoId = $"{Project01}.{Build01}";
            string message = "Finalizing";
            double percentCompleted = 0.95;
            int revision = 553;
            string state = "ACTIVE";
            env.Builds
                .GetByLocatorAsync(BuildLocatorType.Engine, TranslationEngine01, CancellationToken.None)
                .Returns(
                    Task.FromResult(
                        new Build
                        {
                            Id = Build01,
                            Message = message,
                            PercentCompleted = percentCompleted,
                            Revision = revision,
                            State = state,
                        }
                    )
                );
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineApi).Returns(Task.FromResult(false));

            // SUT
            BuildDto? actual = await env.Service.GetCurrentBuildAsync(
                User01,
                Project01,
                minRevision: null,
                CancellationToken.None
            );

            Assert.IsNotNull(actual);
            Assert.AreEqual(message, actual.Message);
            Assert.AreEqual(percentCompleted, actual.PercentCompleted);
            Assert.AreEqual(revision, actual.Revision);
            Assert.AreEqual(state, actual.State);
            Assert.AreEqual(buildDtoId, actual.Id);
            Assert.AreEqual(MachineApi.GetBuildHref(Project01, Build01), actual.Href);
            Assert.AreEqual(Project01, actual.Engine.Id);
            Assert.AreEqual(MachineApi.GetEngineHref(Project01), actual.Engine.Href);
        }

        [Test]
        public async Task GetCurrentBuildAsync_MachineApiSuccess()
        {
            // Set up test environment
            var env = new TestEnvironment();
            string buildDtoId = $"{Project01}.{Build01}";
            string message = "Finalizing";
            double percentCompleted = 0.95;
            int revision = 553;
            string state = "ACTIVE";
            env.MachineBuildService
                .GetCurrentBuildAsync(TranslationEngine01, minRevision: null, CancellationToken.None)
                .Returns(
                    Task.FromResult(
                        new BuildDto
                        {
                            Href = "https://example.com",
                            Id = Build01,
                            Engine = new ResourceDto { Id = "engineId", Href = "https://example.com" },
                            Message = message,
                            PercentCompleted = percentCompleted,
                            Revision = revision,
                            State = state,
                        }
                    )
                );
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

            // SUT
            BuildDto? actual = await env.Service.GetCurrentBuildAsync(
                User01,
                Project01,
                minRevision: null,
                CancellationToken.None
            );

            Assert.IsNotNull(actual);
            Assert.AreEqual(message, actual.Message);
            Assert.AreEqual(percentCompleted, actual.PercentCompleted);
            Assert.AreEqual(revision, actual.Revision);
            Assert.AreEqual(state, actual.State);
            Assert.AreEqual(buildDtoId, actual.Id);
            Assert.AreEqual(MachineApi.GetBuildHref(Project01, Build01), actual.Href);
            Assert.AreEqual(Project01, actual.Engine.Id);
            Assert.AreEqual(MachineApi.GetEngineHref(Project01), actual.Engine.Href);
        }

        [Test]
        public async Task GetCurrentBuildAsync_ExecutesOnlyInProcessIfBothEnabled()
        {
            // Set up test environment
            var env = new TestEnvironment();

            // SUT
            _ = await env.Service.GetCurrentBuildAsync(User01, Project01, minRevision: null, CancellationToken.None);

            await env.Builds
                .Received(1)
                .GetByLocatorAsync(BuildLocatorType.Engine, TranslationEngine01, CancellationToken.None);
            await env.MachineBuildService
                .DidNotReceiveWithAnyArgs()
                .GetCurrentBuildAsync(TranslationEngine01, minRevision: null, CancellationToken.None);
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
        public void GetEngineAsync_InProcessNoEngine()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineApi).Returns(Task.FromResult(false));
            env.Engines
                .GetByLocatorAsync(EngineLocatorType.Project, Project01, CancellationToken.None)
                .Returns(Task.FromResult<Engine>(null));

            // SUT
            Assert.ThrowsAsync<DataNotFoundException>(
                () => env.Service.GetEngineAsync(User01, Project01, CancellationToken.None)
            );
        }

        [Test]
        public void GetEngineAsync_MachineApiNoTranslationEngine()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

            // SUT
            Assert.ThrowsAsync<DataNotFoundException>(
                () => env.Service.GetEngineAsync(User01, Project03, CancellationToken.None)
            );
        }

        [Test]
        public void GetEngineAsync_MachineApiOutageNoInProcess()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.MachineTranslationService
                .GetTranslationEngineAsync(TranslationEngine01, CancellationToken.None)
                .Throws(new BrokenCircuitException());
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

            // SUT
            Assert.ThrowsAsync<BrokenCircuitException>(
                () => env.Service.GetEngineAsync(User01, Project01, CancellationToken.None)
            );
        }

        [Test]
        public async Task GetEngineAsync_MachineApiOutageFailsToInProcess()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.MachineTranslationService
                .GetTranslationEngineAsync(TranslationEngine01, CancellationToken.None)
                .Throws(new BrokenCircuitException());
            env.Engines
                .GetByLocatorAsync(EngineLocatorType.Project, Project01, CancellationToken.None)
                .Returns(Task.FromResult(new Engine()));

            // SUT
            await env.Service.GetEngineAsync(User01, Project01, CancellationToken.None);

            env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
        }

        [Test]
        public async Task GetEngineAsync_InProcessSuccess()
        {
            // Set up test environment
            var env = new TestEnvironment();
            string sourceLanguageTag = "en_US";
            string targetLanguageTag = "en_NZ";
            int confidence = 100;
            int corpusSize = 472;
            env.Engines
                .GetByLocatorAsync(EngineLocatorType.Project, Project01, CancellationToken.None)
                .Returns(
                    Task.FromResult(
                        new Engine
                        {
                            Confidence = confidence,
                            Id = Project01,
                            IsShared = false,
                            Revision = 1,
                            SourceLanguageTag = sourceLanguageTag,
                            TargetLanguageTag = targetLanguageTag,
                            TrainedSegmentCount = corpusSize,
                        }
                    )
                );
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineApi).Returns(Task.FromResult(false));

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
        public async Task GetEngineAsync_MachineApiSuccess()
        {
            // Set up test environment
            var env = new TestEnvironment();
            string sourceLanguageTag = "en_US";
            string targetLanguageTag = "en_NZ";
            int confidence = 100;
            int corpusSize = 472;
            env.MachineTranslationService
                .GetTranslationEngineAsync(TranslationEngine01, CancellationToken.None)
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
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

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
        public async Task GetEngineAsync_ExecutesApiAndInProcess()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.MachineTranslationService
                .GetTranslationEngineAsync(TranslationEngine01, CancellationToken.None)
                .Returns(Task.FromResult(new MachineApiTranslationEngine()));
            env.Engines
                .GetByLocatorAsync(EngineLocatorType.Project, Project01, CancellationToken.None)
                .Returns(Task.FromResult(new Engine()));

            // SUT
            _ = await env.Service.GetEngineAsync(User01, Project01, CancellationToken.None);

            await env.Engines
                .Received(1)
                .GetByLocatorAsync(EngineLocatorType.Project, Project01, CancellationToken.None);
            await env.MachineTranslationService
                .Received(1)
                .GetTranslationEngineAsync(TranslationEngine01, CancellationToken.None);
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
        public void GetWordGraphAsync_InProcessNoEngine()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineApi).Returns(Task.FromResult(false));
            env.Engines
                .GetByLocatorAsync(EngineLocatorType.Project, Project01, CancellationToken.None)
                .Returns(Task.FromResult<Engine>(null));

            // SUT
            Assert.ThrowsAsync<DataNotFoundException>(
                () => env.Service.GetWordGraphAsync(User01, Project01, Array.Empty<string>(), CancellationToken.None)
            );
        }

        [Test]
        public void GetWordGraphAsync_MachineApiNoTranslationEngine()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

            // SUT
            Assert.ThrowsAsync<DataNotFoundException>(
                () => env.Service.GetWordGraphAsync(User01, Project03, Array.Empty<string>(), CancellationToken.None)
            );
        }

        [Test]
        public void GetWordGraphAsync_MachineApiOutageNoInProcess()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.MachineTranslationService
                .GetWordGraphAsync(TranslationEngine01, Array.Empty<string>(), CancellationToken.None)
                .Throws(new BrokenCircuitException());
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

            // SUT
            Assert.ThrowsAsync<BrokenCircuitException>(
                () => env.Service.GetWordGraphAsync(User01, Project01, Array.Empty<string>(), CancellationToken.None)
            );
        }

        [Test]
        public async Task GetWordGraphAsync_MachineApiOutageFailsToInProcess()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.MachineTranslationService
                .GetWordGraphAsync(TranslationEngine01, Array.Empty<string>(), CancellationToken.None)
                .Throws(new BrokenCircuitException());
            env.EngineService
                .GetWordGraphAsync(TranslationEngine01, Array.Empty<string>())
                .Returns(Task.FromResult(new WordGraph(Array.Empty<WordGraphArc>(), Array.Empty<int>())));

            // SUT
            await env.Service.GetWordGraphAsync(User01, Project01, Array.Empty<string>(), CancellationToken.None);

            env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
        }

        [Test]
        public async Task GetWordGraphAsync_InProcessSuccess()
        {
            // Set up test environment
            var env = new TestEnvironment();
            float initialStateScore = -91.43696f;
            env.EngineService
                .GetWordGraphAsync(TranslationEngine01, Array.Empty<string>())
                .Returns(
                    Task.FromResult(
                        new WordGraph(
                            new[]
                            {
                                new WordGraphArc(
                                    0,
                                    0,
                                    0.0,
                                    Array.Empty<string>(),
                                    new WordAlignmentMatrix(0, 0),
                                    Range<int>.Null,
                                    Array.Empty<TranslationSources>()
                                )
                            },
                            new[] { 1 },
                            initialStateScore
                        )
                    )
                );
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineApi).Returns(Task.FromResult(false));

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
        public async Task GetWordGraphAsync_MachineApiSuccess()
        {
            // Set up test environment
            var env = new TestEnvironment();
            float initialStateScore = -91.43696f;
            env.MachineTranslationService
                .GetWordGraphAsync(TranslationEngine01, Array.Empty<string>(), CancellationToken.None)
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
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

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
        public async Task GetWordGraphAsync_ExecutesApiAndInProcess()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.EngineService
                .GetWordGraphAsync(TranslationEngine01, Array.Empty<string>())
                .Returns(Task.FromResult(new WordGraph()));

            // SUT
            _ = await env.Service.GetWordGraphAsync(User01, Project01, Array.Empty<string>(), CancellationToken.None);

            await env.EngineService.Received(1).GetWordGraphAsync(TranslationEngine01, Array.Empty<string>());
            await env.MachineTranslationService
                .Received(1)
                .GetWordGraphAsync(TranslationEngine01, Array.Empty<string>(), CancellationToken.None);
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
        public void StartBuildAsync_InProcessNoEngine()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineApi).Returns(Task.FromResult(false));
            env.Engines
                .GetByLocatorAsync(EngineLocatorType.Project, Project01, CancellationToken.None)
                .Returns(Task.FromResult<Engine>(null));

            // SUT
            Assert.ThrowsAsync<DataNotFoundException>(
                () => env.Service.StartBuildAsync(User01, Project01, CancellationToken.None)
            );
        }

        [Test]
        public void StartBuildAsync_MachineApiNoTranslationEngine()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

            // SUT
            Assert.ThrowsAsync<DataNotFoundException>(
                () => env.Service.StartBuildAsync(User01, Project03, CancellationToken.None)
            );
        }

        [Test]
        public void StartBuildAsync_MachineApiOutageNoInProcess()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.MachineBuildService
                .StartBuildAsync(TranslationEngine01, CancellationToken.None)
                .Throws(new BrokenCircuitException());
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

            // SUT
            Assert.ThrowsAsync<BrokenCircuitException>(
                () => env.Service.StartBuildAsync(User01, Project01, CancellationToken.None)
            );
        }

        [Test]
        public async Task StartBuildAsync_MachineApiOutageFailsToInProcess()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.MachineBuildService
                .StartBuildAsync(TranslationEngine01, CancellationToken.None)
                .Throws(new BrokenCircuitException());
            env.EngineService.StartBuildAsync(TranslationEngine01).Returns(Task.FromResult(new Build()));

            // SUT
            await env.Service.StartBuildAsync(User01, Project01, CancellationToken.None);

            env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
        }

        [Test]
        public async Task StartBuildAsync_InProcessSuccess()
        {
            // Set up test environment
            var env = new TestEnvironment();
            string buildDtoId = $"{Project01}.{Build01}";
            string message = "Training language model";
            double percentCompleted = 0.01;
            int revision = 2;
            string state = "ACTIVE";
            env.EngineService
                .StartBuildAsync(TranslationEngine01)
                .Returns(
                    Task.FromResult(
                        new Build
                        {
                            Id = Build01,
                            Message = message,
                            PercentCompleted = percentCompleted,
                            Revision = revision,
                            State = state,
                        }
                    )
                );
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineApi).Returns(Task.FromResult(false));

            // SUT
            BuildDto actual = await env.Service.StartBuildAsync(User01, Project01, CancellationToken.None);

            Assert.AreEqual(message, actual.Message);
            Assert.AreEqual(percentCompleted, actual.PercentCompleted);
            Assert.AreEqual(revision, actual.Revision);
            Assert.AreEqual(state, actual.State);
            Assert.AreEqual(buildDtoId, actual.Id);
            Assert.AreEqual(MachineApi.GetBuildHref(Project01, Build01), actual.Href);
            Assert.AreEqual(Project01, actual.Engine.Id);
            Assert.AreEqual(MachineApi.GetEngineHref(Project01), actual.Engine.Href);
        }

        [Test]
        public async Task StartBuildAsync_MachineApiSuccess()
        {
            // Set up test environment
            var env = new TestEnvironment();
            string buildDtoId = $"{Project01}.{Build01}";
            string message = "Training language model";
            double percentCompleted = 0.01;
            int revision = 2;
            string state = "ACTIVE";
            env.MachineBuildService
                .StartBuildAsync(TranslationEngine01, CancellationToken.None)
                .Returns(
                    Task.FromResult(
                        new BuildDto
                        {
                            Href = "https://example.com",
                            Id = Build01,
                            Engine = new ResourceDto { Id = "engineId", Href = "https://example.com" },
                            Message = message,
                            PercentCompleted = percentCompleted,
                            Revision = revision,
                            State = state,
                        }
                    )
                );
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

            // SUT
            BuildDto actual = await env.Service.StartBuildAsync(User01, Project01, CancellationToken.None);

            Assert.AreEqual(message, actual.Message);
            Assert.AreEqual(percentCompleted, actual.PercentCompleted);
            Assert.AreEqual(revision, actual.Revision);
            Assert.AreEqual(state, actual.State);
            Assert.AreEqual(buildDtoId, actual.Id);
            Assert.AreEqual(MachineApi.GetBuildHref(Project01, Build01), actual.Href);
            Assert.AreEqual(Project01, actual.Engine.Id);
            Assert.AreEqual(MachineApi.GetEngineHref(Project01), actual.Engine.Href);
        }

        [Test]
        public async Task StartBuildAsync_ExecutesApiAndInProcess()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.EngineService.StartBuildAsync(TranslationEngine01).Returns(Task.FromResult(new Build()));

            // SUT
            _ = await env.Service.StartBuildAsync(User01, Project01, CancellationToken.None);

            await env.EngineService.Received(1).StartBuildAsync(TranslationEngine01);
            await env.MachineBuildService.Received(1).StartBuildAsync(TranslationEngine01, CancellationToken.None);
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
        public void TrainSegmentAsync_InProcessNoEngine()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineApi).Returns(Task.FromResult(false));
            env.Engines
                .GetByLocatorAsync(EngineLocatorType.Project, Project01, CancellationToken.None)
                .Returns(Task.FromResult<Engine>(null));

            // SUT
            Assert.ThrowsAsync<DataNotFoundException>(
                () => env.Service.TrainSegmentAsync(User01, Project01, new SegmentPairDto(), CancellationToken.None)
            );
        }

        [Test]
        public void TrainSegmentAsync_MachineApiNoTranslationEngine()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

            // SUT
            Assert.ThrowsAsync<DataNotFoundException>(
                () => env.Service.TrainSegmentAsync(User01, Project03, new SegmentPairDto(), CancellationToken.None)
            );
        }

        [Test]
        public void TrainSegmentAsync_MachineApiOutageNoInProcess()
        {
            // Set up test environment
            var env = new TestEnvironment();
            var segmentPairDto = new SegmentPairDto();
            env.MachineTranslationService
                .TrainSegmentAsync(TranslationEngine01, segmentPairDto, CancellationToken.None)
                .Throws(new BrokenCircuitException());
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

            // SUT
            Assert.ThrowsAsync<BrokenCircuitException>(
                () => env.Service.TrainSegmentAsync(User01, Project01, segmentPairDto, CancellationToken.None)
            );
        }

        [Test]
        public async Task TrainSegmentAsync_MachineApiOutageFailsToInProcess()
        {
            // Set up test environment
            var env = new TestEnvironment();
            var segmentPairDto = new SegmentPairDto();
            env.MachineTranslationService
                .TrainSegmentAsync(TranslationEngine01, segmentPairDto, CancellationToken.None)
                .Throws(new BrokenCircuitException());
            env.EngineService
                .TrainSegmentAsync(
                    TranslationEngine01,
                    segmentPairDto.SourceSegment,
                    segmentPairDto.TargetSegment,
                    segmentPairDto.SentenceStart
                )
                .Returns(Task.FromResult(true));

            // SUT
            await env.Service.TrainSegmentAsync(User01, Project01, segmentPairDto, CancellationToken.None);

            env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
        }

        [Test]
        public async Task TrainSegmentAsync_InProcessSuccess()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineApi).Returns(Task.FromResult(false));
            var segmentPair = new SegmentPairDto();

            // SUT
            await env.Service.TrainSegmentAsync(User01, Project01, segmentPair, CancellationToken.None);

            await env.EngineService
                .Received(1)
                .TrainSegmentAsync(
                    TranslationEngine01,
                    segmentPair.SourceSegment,
                    segmentPair.TargetSegment,
                    segmentPair.SentenceStart
                );
        }

        [Test]
        public async Task TrainSegmentAsync_MachineApiSuccess()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));
            var segmentPair = new SegmentPairDto();

            // SUT
            await env.Service.TrainSegmentAsync(User01, Project01, segmentPair, CancellationToken.None);

            await env.MachineTranslationService
                .Received(1)
                .TrainSegmentAsync(TranslationEngine01, segmentPair, CancellationToken.None);
        }

        [Test]
        public async Task TrainSegmentAsync_ExecutesApiAndInProcess()
        {
            // Set up test environment
            var env = new TestEnvironment();
            var segmentPair = new SegmentPairDto();

            // SUT
            await env.Service.TrainSegmentAsync(User01, Project01, segmentPair, CancellationToken.None);

            await env.EngineService
                .Received(1)
                .TrainSegmentAsync(
                    TranslationEngine01,
                    segmentPair.SourceSegment,
                    segmentPair.TargetSegment,
                    segmentPair.SentenceStart
                );
            await env.MachineTranslationService
                .Received(1)
                .TrainSegmentAsync(TranslationEngine01, segmentPair, CancellationToken.None);
        }

        private class TestEnvironment
        {
            public TestEnvironment()
            {
                Builds = Substitute.For<IBuildRepository>();
                Engines = Substitute.For<IEngineRepository>();
                Engines
                    .GetByLocatorAsync(EngineLocatorType.Project, Project01, CancellationToken.None)
                    .Returns(
                        Task.FromResult(
                            new Engine
                            {
                                Confidence = 100,
                                Id = TranslationEngine01,
                                SourceLanguageTag = "en_US",
                                TrainedSegmentCount = 472,
                                TargetLanguageTag = "en_NZ",
                            }
                        )
                    );
                IOptions<EngineOptions> engineOptions = Options.Create(new EngineOptions());
                EngineService = Substitute.For<IEngineService>();
                ExceptionHandler = Substitute.For<IExceptionHandler>();
                FeatureManager = Substitute.For<IFeatureManager>();
                FeatureManager.IsEnabledAsync(FeatureFlags.MachineApi).Returns(Task.FromResult(true));
                FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(true));

                MachineBuildService = Substitute.For<IMachineBuildService>();
                MachineTranslationService = Substitute.For<IMachineTranslationService>();
                var projectSecrets = new MemoryRepository<SFProjectSecret>(
                    new[]
                    {
                        new SFProjectSecret
                        {
                            Id = Project01,
                            MachineData = new MachineData { TranslationEngineId = TranslationEngine01 },
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
                                UserRoles = new Dictionary<string, string> { { User01, SFProjectRole.Administrator } },
                            },
                            new SFProject { Id = Project02 },
                            new SFProject
                            {
                                Id = Project03,
                                UserRoles = new Dictionary<string, string> { { User01, SFProjectRole.Translator } },
                            },
                        }
                    )
                );

                Service = new MachineApiService(
                    Builds,
                    Engines,
                    engineOptions,
                    EngineService,
                    ExceptionHandler,
                    FeatureManager,
                    MachineBuildService,
                    MachineTranslationService,
                    projectSecrets,
                    realtimeService
                );
            }

            public IBuildRepository Builds { get; }
            public IEngineRepository Engines { get; }
            public IEngineService EngineService { get; }
            public IExceptionHandler ExceptionHandler { get; }
            public IFeatureManager FeatureManager { get; }
            public IMachineBuildService MachineBuildService { get; }
            public IMachineTranslationService MachineTranslationService { get; }
            public MachineApiService Service { get; }
        }
    }
}
