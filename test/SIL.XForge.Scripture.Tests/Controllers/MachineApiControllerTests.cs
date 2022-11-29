using System;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using NUnit.Framework;
using Polly.CircuitBreaker;
using SIL.Machine.WebApi;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Controllers
{
    [TestFixture]
    public class MachineApiControllerTests
    {
        private const string Project01 = "project01";
        private const string User01 = "user01";

        [Test]
        public async Task GetBuildAsync_BuildEnded()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.MachineApiService
                .GetCurrentBuildAsync(User01, Project01, null, CancellationToken.None)
                .Throws(new DataNotFoundException("Entity Deleted"));

            // SUT
            ActionResult<BuildDto?> actual = await env.Controller.GetBuildAsync(
                Project01,
                null,
                CancellationToken.None
            );

            Assert.IsInstanceOf<NotFoundResult>(actual.Result);
        }

        [Test]
        public async Task GetBuildAsync_MachineApiDown()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.MachineApiService
                .GetCurrentBuildAsync(User01, Project01, null, CancellationToken.None)
                .Throws(new BrokenCircuitException());

            // SUT
            ActionResult<BuildDto?> actual = await env.Controller.GetBuildAsync(
                Project01,
                null,
                CancellationToken.None
            );

            env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
            Assert.IsInstanceOf<ObjectResult>(actual.Result);
            Assert.AreEqual((int)HttpStatusCode.ServiceUnavailable, (actual.Result as ObjectResult)?.StatusCode);
        }

        [Test]
        public async Task GetBuildAsync_NoBuildRunning()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.MachineApiService
                .GetCurrentBuildAsync(User01, Project01, null, CancellationToken.None)
                .Returns(Task.FromResult<BuildDto>(null));

            // SUT
            ActionResult<BuildDto?> actual = await env.Controller.GetBuildAsync(
                Project01,
                null,
                CancellationToken.None
            );

            Assert.IsInstanceOf<NoContentResult>(actual.Result);
        }

        [Test]
        public async Task GetBuildAsync_NoPermission()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.MachineApiService
                .GetCurrentBuildAsync(User01, Project01, null, CancellationToken.None)
                .Throws(new ForbiddenException());

            // SUT
            ActionResult<BuildDto?> actual = await env.Controller.GetBuildAsync(
                Project01,
                null,
                CancellationToken.None
            );

            Assert.IsInstanceOf<ForbidResult>(actual.Result);
        }

        [Test]
        public async Task GetBuildAsync_NoProject()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.MachineApiService
                .GetCurrentBuildAsync(User01, Project01, null, CancellationToken.None)
                .Throws(new DataNotFoundException(string.Empty));

            // SUT
            ActionResult<BuildDto?> actual = await env.Controller.GetBuildAsync(
                Project01,
                null,
                CancellationToken.None
            );

            Assert.IsInstanceOf<NotFoundResult>(actual.Result);
        }

        [Test]
        public async Task GetBuildAsync_Success()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.MachineApiService
                .GetCurrentBuildAsync(User01, Project01, null, CancellationToken.None)
                .Returns(Task.FromResult(new BuildDto()));

            // SUT
            ActionResult<BuildDto?> actual = await env.Controller.GetBuildAsync(
                Project01,
                null,
                CancellationToken.None
            );

            Assert.IsInstanceOf<OkObjectResult>(actual.Result);
        }

        [Test]
        public async Task GetEngineAsync_MachineApiDown()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.MachineApiService
                .GetEngineAsync(User01, Project01, CancellationToken.None)
                .Throws(new BrokenCircuitException());

            // SUT
            ActionResult<EngineDto> actual = await env.Controller.GetEngineAsync(Project01, CancellationToken.None);

            env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
            Assert.IsInstanceOf<ObjectResult>(actual.Result);
            Assert.AreEqual((int)HttpStatusCode.ServiceUnavailable, (actual.Result as ObjectResult)?.StatusCode);
        }

        [Test]
        public async Task GetEngineAsync_NoPermission()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.MachineApiService
                .GetEngineAsync(User01, Project01, CancellationToken.None)
                .Throws(new ForbiddenException());

            // SUT
            ActionResult<EngineDto> actual = await env.Controller.GetEngineAsync(Project01, CancellationToken.None);

            Assert.IsInstanceOf<ForbidResult>(actual.Result);
        }

        [Test]
        public async Task GetEngineAsync_NoProject()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.MachineApiService
                .GetEngineAsync(User01, Project01, CancellationToken.None)
                .Throws(new DataNotFoundException(string.Empty));

            // SUT
            ActionResult<EngineDto> actual = await env.Controller.GetEngineAsync(Project01, CancellationToken.None);

            Assert.IsInstanceOf<NotFoundResult>(actual.Result);
        }

        [Test]
        public async Task GetEngineAsync_Success()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.MachineApiService
                .GetEngineAsync(User01, Project01, CancellationToken.None)
                .Returns(Task.FromResult(new EngineDto()));

            // SUT
            ActionResult<EngineDto> actual = await env.Controller.GetEngineAsync(Project01, CancellationToken.None);

            Assert.IsInstanceOf<OkObjectResult>(actual.Result);
        }

        [Test]
        public async Task GetWordGraphAsync_MachineApiDown()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.MachineApiService
                .GetWordGraphAsync(User01, Project01, Array.Empty<string>(), CancellationToken.None)
                .Throws(new BrokenCircuitException());

            // SUT
            ActionResult<WordGraphDto> actual = await env.Controller.GetWordGraphAsync(
                Project01,
                Array.Empty<string>(),
                CancellationToken.None
            );

            env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
            Assert.IsInstanceOf<ObjectResult>(actual.Result);
            Assert.AreEqual((int)HttpStatusCode.ServiceUnavailable, (actual.Result as ObjectResult)?.StatusCode);
        }

        [Test]
        public async Task GetWordGraphAsync_NoPermission()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.MachineApiService
                .GetWordGraphAsync(User01, Project01, Array.Empty<string>(), CancellationToken.None)
                .Throws(new ForbiddenException());

            // SUT
            ActionResult<WordGraphDto> actual = await env.Controller.GetWordGraphAsync(
                Project01,
                Array.Empty<string>(),
                CancellationToken.None
            );

            Assert.IsInstanceOf<ForbidResult>(actual.Result);
        }

        [Test]
        public async Task GetWordGraphAsync_NoProject()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.MachineApiService
                .GetWordGraphAsync(User01, Project01, Array.Empty<string>(), CancellationToken.None)
                .Throws(new DataNotFoundException(string.Empty));

            // SUT
            ActionResult<WordGraphDto> actual = await env.Controller.GetWordGraphAsync(
                Project01,
                Array.Empty<string>(),
                CancellationToken.None
            );

            Assert.IsInstanceOf<NotFoundResult>(actual.Result);
        }

        [Test]
        public async Task GetWordGraphAsync_Success()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.MachineApiService
                .GetWordGraphAsync(User01, Project01, Array.Empty<string>(), CancellationToken.None)
                .Returns(Task.FromResult(new WordGraphDto()));

            // SUT
            ActionResult<WordGraphDto> actual = await env.Controller.GetWordGraphAsync(
                Project01,
                Array.Empty<string>(),
                CancellationToken.None
            );

            Assert.IsInstanceOf<OkObjectResult>(actual.Result);
        }

        [Test]
        public async Task StartBuildAsync_MachineApiDown()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.MachineApiService
                .StartBuildAsync(User01, Project01, CancellationToken.None)
                .Throws(new BrokenCircuitException());

            // SUT
            ActionResult<BuildDto> actual = await env.Controller.StartBuildAsync(Project01, CancellationToken.None);

            env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
            Assert.IsInstanceOf<ObjectResult>(actual.Result);
            Assert.AreEqual((int)HttpStatusCode.ServiceUnavailable, (actual.Result as ObjectResult)?.StatusCode);
        }

        [Test]
        public async Task StartBuildAsync_NoPermission()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.MachineApiService
                .StartBuildAsync(User01, Project01, CancellationToken.None)
                .Throws(new ForbiddenException());

            // SUT
            ActionResult<BuildDto> actual = await env.Controller.StartBuildAsync(Project01, CancellationToken.None);

            Assert.IsInstanceOf<ForbidResult>(actual.Result);
        }

        [Test]
        public async Task StartBuildAsync_NoProject()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.MachineApiService
                .StartBuildAsync(User01, Project01, CancellationToken.None)
                .Throws(new DataNotFoundException(string.Empty));

            // SUT
            ActionResult<BuildDto> actual = await env.Controller.StartBuildAsync(Project01, CancellationToken.None);

            Assert.IsInstanceOf<NotFoundResult>(actual.Result);
        }

        [Test]
        public async Task StartBuildAsync_Success()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.MachineApiService
                .StartBuildAsync(User01, Project01, CancellationToken.None)
                .Returns(Task.FromResult(new BuildDto()));

            // SUT
            ActionResult<BuildDto> actual = await env.Controller.StartBuildAsync(Project01, CancellationToken.None);

            Assert.IsInstanceOf<OkObjectResult>(actual.Result);
        }

        [Test]
        public async Task TrainSegmentAsync_MachineApiDown()
        {
            // Set up test environment
            var env = new TestEnvironment();
            var segmentPair = new SegmentPairDto();
            env.MachineApiService
                .TrainSegmentAsync(User01, Project01, segmentPair, CancellationToken.None)
                .Throws(new BrokenCircuitException());

            // SUT
            ActionResult actual = await env.Controller.TrainSegmentAsync(
                Project01,
                segmentPair,
                CancellationToken.None
            );

            env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
            Assert.IsInstanceOf<ObjectResult>(actual);
            Assert.AreEqual((int)HttpStatusCode.ServiceUnavailable, (actual as ObjectResult)?.StatusCode);
        }

        [Test]
        public async Task TrainSegmentAsync_NoPermission()
        {
            // Set up test environment
            var env = new TestEnvironment();
            var segmentPair = new SegmentPairDto();
            env.MachineApiService
                .TrainSegmentAsync(User01, Project01, segmentPair, CancellationToken.None)
                .Throws(new ForbiddenException());

            // SUT
            ActionResult actual = await env.Controller.TrainSegmentAsync(
                Project01,
                segmentPair,
                CancellationToken.None
            );

            Assert.IsInstanceOf<ForbidResult>(actual);
        }

        [Test]
        public async Task TrainSegmentAsync_NoProject()
        {
            // Set up test environment
            var env = new TestEnvironment();
            var segmentPair = new SegmentPairDto();
            env.MachineApiService
                .TrainSegmentAsync(User01, Project01, segmentPair, CancellationToken.None)
                .Throws(new DataNotFoundException(string.Empty));

            // SUT
            ActionResult actual = await env.Controller.TrainSegmentAsync(
                Project01,
                segmentPair,
                CancellationToken.None
            );

            Assert.IsInstanceOf<NotFoundResult>(actual);
        }

        [Test]
        public async Task TrainSegmentAsync_Success()
        {
            // Set up test environment
            var env = new TestEnvironment();
            var segmentPair = new SegmentPairDto();

            // SUT
            ActionResult actual = await env.Controller.TrainSegmentAsync(
                Project01,
                segmentPair,
                CancellationToken.None
            );

            Assert.IsInstanceOf<OkResult>(actual);
            await env.MachineApiService
                .Received(1)
                .TrainSegmentAsync(User01, Project01, segmentPair, CancellationToken.None);
        }

        private class TestEnvironment
        {
            public TestEnvironment()
            {
                var userAccessor = Substitute.For<IUserAccessor>();
                userAccessor.UserId.Returns(User01);
                ExceptionHandler = Substitute.For<IExceptionHandler>();
                MachineApiService = Substitute.For<IMachineApiService>();

                Controller = new MachineApiController(ExceptionHandler, MachineApiService, userAccessor);
            }

            public MachineApiController Controller { get; }
            public IExceptionHandler ExceptionHandler { get; }
            public IMachineApiService MachineApiService { get; }
        }
    }
}
