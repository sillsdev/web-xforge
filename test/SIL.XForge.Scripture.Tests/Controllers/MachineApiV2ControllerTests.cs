using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using NUnit.Framework;
using Polly.CircuitBreaker;
using Serval.Client;
using SIL.Machine.WebApi;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Controllers;

[Obsolete("This class will be removed when JavaScript clients have updated to the latest Machine.js")]
[TestFixture]
public class MachineApiV2ControllerTests
{
    private const string Build01 = "build01";
    private const string Project01 = "project01";
    private const string User01 = "user01";

    [Test]
    public async Task GetBuildAsync_BuildEnded()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetBuildAsync(User01, Project01, Build01, null, false, CancellationToken.None)
            .Throws(new DataNotFoundException("Entity Deleted"));

        // SUT
        ActionResult<BuildDto?> actual = await env.Controller.GetBuildAsync(
            Project01,
            Build01,
            minRevision: null,
            CancellationToken.None
        );

        Assert.IsInstanceOf<NotFoundResult>(actual.Result);
    }

    [Test]
    public async Task GetBuildAsync_MachineApiDown()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetBuildAsync(User01, Project01, Build01, null, false, CancellationToken.None)
            .Throws(new BrokenCircuitException());

        // SUT
        ActionResult<BuildDto?> actual = await env.Controller.GetBuildAsync(
            Project01,
            Build01,
            minRevision: null,
            CancellationToken.None
        );

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
        Assert.IsInstanceOf<ObjectResult>(actual.Result);
        Assert.AreEqual(StatusCodes.Status503ServiceUnavailable, (actual.Result as ObjectResult)?.StatusCode);
    }

    [Test]
    public async Task GetBuildAsync_NoBuildRunning()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetBuildAsync(User01, Project01, Build01, null, false, CancellationToken.None)
            .Returns(Task.FromResult<ServalBuildDto>(null));

        // SUT
        ActionResult<BuildDto?> actual = await env.Controller.GetBuildAsync(
            Project01,
            Build01,
            minRevision: null,
            CancellationToken.None
        );

        Assert.IsInstanceOf<NoContentResult>(actual.Result);
    }

    [Test]
    public async Task GetBuildAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetBuildAsync(User01, Project01, Build01, null, false, CancellationToken.None)
            .Throws(new ForbiddenException());

        // SUT
        ActionResult<BuildDto?> actual = await env.Controller.GetBuildAsync(
            Project01,
            Build01,
            minRevision: null,
            CancellationToken.None
        );

        Assert.IsInstanceOf<ForbidResult>(actual.Result);
    }

    [Test]
    public async Task GetBuildAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetBuildAsync(User01, Project01, Build01, null, false, CancellationToken.None)
            .Throws(new DataNotFoundException(string.Empty));

        // SUT
        ActionResult<BuildDto?> actual = await env.Controller.GetBuildAsync(
            Project01,
            Build01,
            minRevision: null,
            CancellationToken.None
        );

        Assert.IsInstanceOf<NotFoundResult>(actual.Result);
    }

    [Test]
    public async Task GetBuildAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetBuildAsync(User01, Project01, Build01, null, false, CancellationToken.None)
            .Returns(Task.FromResult(new ServalBuildDto { Engine = new ResourceDto() }));

        // SUT
        ActionResult<BuildDto?> actual = await env.Controller.GetBuildAsync(
            Project01,
            Build01,
            minRevision: null,
            CancellationToken.None
        );

        Assert.IsInstanceOf<OkObjectResult>(actual.Result);
    }

    [Test]
    public async Task GetBuildAsync_NoBuildIdBuildEnded()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetCurrentBuildAsync(User01, Project01, null, false, CancellationToken.None)
            .Throws(new DataNotFoundException("Entity Deleted"));

        // SUT
        ActionResult<BuildDto?> actual = await env.Controller.GetBuildAsync(
            Project01,
            buildId: null,
            minRevision: null,
            CancellationToken.None
        );

        Assert.IsInstanceOf<NotFoundResult>(actual.Result);
    }

    [Test]
    public async Task GetBuildAsync_NoBuildIdMachineApiDown()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetCurrentBuildAsync(User01, Project01, null, false, CancellationToken.None)
            .Throws(new BrokenCircuitException());

        // SUT
        ActionResult<BuildDto?> actual = await env.Controller.GetBuildAsync(
            Project01,
            buildId: null,
            minRevision: null,
            CancellationToken.None
        );

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
        Assert.IsInstanceOf<ObjectResult>(actual.Result);
        Assert.AreEqual(StatusCodes.Status503ServiceUnavailable, (actual.Result as ObjectResult)?.StatusCode);
    }

    [Test]
    public async Task GetBuildAsync_NoBuildIdNoBuildRunning()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetCurrentBuildAsync(User01, Project01, null, false, CancellationToken.None)
            .Returns(Task.FromResult<ServalBuildDto>(null));

        // SUT
        ActionResult<BuildDto?> actual = await env.Controller.GetBuildAsync(
            Project01,
            buildId: null,
            minRevision: null,
            CancellationToken.None
        );

        Assert.IsInstanceOf<NoContentResult>(actual.Result);
    }

    [Test]
    public async Task GetBuildAsync_NoBuildIdNoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetCurrentBuildAsync(User01, Project01, null, false, CancellationToken.None)
            .Throws(new ForbiddenException());

        // SUT
        ActionResult<BuildDto?> actual = await env.Controller.GetBuildAsync(
            Project01,
            buildId: null,
            minRevision: null,
            CancellationToken.None
        );

        Assert.IsInstanceOf<ForbidResult>(actual.Result);
    }

    [Test]
    public async Task GetBuildAsync_NoBuildIdNoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetCurrentBuildAsync(User01, Project01, null, false, CancellationToken.None)
            .Throws(new DataNotFoundException(string.Empty));

        // SUT
        ActionResult<BuildDto?> actual = await env.Controller.GetBuildAsync(
            Project01,
            buildId: null,
            minRevision: null,
            CancellationToken.None
        );

        Assert.IsInstanceOf<NotFoundResult>(actual.Result);
    }

    [Test]
    public async Task GetBuildAsync_NoBuildIdSuccess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetCurrentBuildAsync(User01, Project01, null, false, CancellationToken.None)
            .Returns(Task.FromResult(new ServalBuildDto { Engine = new ResourceDto() }));

        // SUT
        ActionResult<BuildDto?> actual = await env.Controller.GetBuildAsync(
            Project01,
            buildId: null,
            minRevision: null,
            CancellationToken.None
        );

        Assert.IsInstanceOf<OkObjectResult>(actual.Result);
    }

    [Test]
    public async Task GetEngineAsync_MachineApiDown()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetEngineAsync(User01, Project01, CancellationToken.None)
            .Throws(new BrokenCircuitException());

        // SUT
        ActionResult<EngineDto> actual = await env.Controller.GetEngineAsync(Project01, CancellationToken.None);

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
        Assert.IsInstanceOf<ObjectResult>(actual.Result);
        Assert.AreEqual(StatusCodes.Status503ServiceUnavailable, (actual.Result as ObjectResult)?.StatusCode);
    }

    [Test]
    public async Task GetEngineAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetEngineAsync(User01, Project01, CancellationToken.None)
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
        env.MachineApiService.GetEngineAsync(User01, Project01, CancellationToken.None)
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
        env.MachineApiService.GetEngineAsync(User01, Project01, CancellationToken.None)
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
        env.MachineApiService.GetWordGraphAsync(User01, Project01, string.Empty, CancellationToken.None)
            .Throws(new BrokenCircuitException());

        // SUT
        ActionResult<WordGraphDto> actual = await env.Controller.GetWordGraphAsync(
            Project01,
            Array.Empty<string>(),
            CancellationToken.None
        );

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
        Assert.IsInstanceOf<ObjectResult>(actual.Result);
        Assert.AreEqual(StatusCodes.Status503ServiceUnavailable, (actual.Result as ObjectResult)?.StatusCode);
    }

    [Test]
    public async Task GetWordGraphAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetWordGraphAsync(User01, Project01, string.Empty, CancellationToken.None)
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
        env.MachineApiService.GetWordGraphAsync(User01, Project01, string.Empty, CancellationToken.None)
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
        env.MachineApiService.GetWordGraphAsync(User01, Project01, string.Empty, CancellationToken.None)
            .Returns(Task.FromResult(new WordGraph()));

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
        env.MachineApiService.StartBuildAsync(User01, Project01, CancellationToken.None)
            .Throws(new BrokenCircuitException());

        // SUT
        ActionResult<BuildDto> actual = await env.Controller.StartBuildAsync(Project01, CancellationToken.None);

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
        Assert.IsInstanceOf<ObjectResult>(actual.Result);
        Assert.AreEqual(StatusCodes.Status503ServiceUnavailable, (actual.Result as ObjectResult)?.StatusCode);
    }

    [Test]
    public async Task StartBuildAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.StartBuildAsync(User01, Project01, CancellationToken.None)
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
        env.MachineApiService.StartBuildAsync(User01, Project01, CancellationToken.None)
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
        env.MachineApiService.StartBuildAsync(User01, Project01, CancellationToken.None)
            .Returns(Task.FromResult(new ServalBuildDto { Engine = new ResourceDto() }));

        // SUT
        ActionResult<BuildDto> actual = await env.Controller.StartBuildAsync(Project01, CancellationToken.None);

        Assert.IsInstanceOf<OkObjectResult>(actual.Result);
    }

    [Test]
    public async Task TrainSegmentAsync_MachineApiDown()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var segmentPairDto = new SegmentPairDto();
        env.MachineApiService.TrainSegmentAsync(User01, Project01, Arg.Any<SegmentPair>(), CancellationToken.None)
            .Throws(new BrokenCircuitException());

        // SUT
        ActionResult actual = await env.Controller.TrainSegmentAsync(Project01, segmentPairDto, CancellationToken.None);

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
        Assert.IsInstanceOf<ObjectResult>(actual);
        Assert.AreEqual(StatusCodes.Status503ServiceUnavailable, (actual as ObjectResult)?.StatusCode);
    }

    [Test]
    public async Task TrainSegmentAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var segmentPairDto = new SegmentPairDto();
        env.MachineApiService.TrainSegmentAsync(User01, Project01, Arg.Any<SegmentPair>(), CancellationToken.None)
            .Throws(new ForbiddenException());

        // SUT
        ActionResult actual = await env.Controller.TrainSegmentAsync(Project01, segmentPairDto, CancellationToken.None);

        Assert.IsInstanceOf<ForbidResult>(actual);
    }

    [Test]
    public async Task TrainSegmentAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var segmentPairDto = new SegmentPairDto();
        env.MachineApiService.TrainSegmentAsync(User01, Project01, Arg.Any<SegmentPair>(), CancellationToken.None)
            .Throws(new DataNotFoundException(string.Empty));

        // SUT
        ActionResult actual = await env.Controller.TrainSegmentAsync(Project01, segmentPairDto, CancellationToken.None);

        Assert.IsInstanceOf<NotFoundResult>(actual);
    }

    [Test]
    public async Task TrainSegmentAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        ActionResult actual = await env.Controller.TrainSegmentAsync(
            Project01,
            new SegmentPairDto(),
            CancellationToken.None
        );

        Assert.IsInstanceOf<OkResult>(actual);
        await env.MachineApiService.Received(1)
            .TrainSegmentAsync(User01, Project01, Arg.Any<SegmentPair>(), CancellationToken.None);
    }

    [Test]
    public async Task TranslateAsync_MachineApiDown()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.TranslateAsync(User01, Project01, string.Empty, CancellationToken.None)
            .Throws(new BrokenCircuitException());

        // SUT
        ActionResult<TranslationResultDto> actual = await env.Controller.TranslateAsync(
            Project01,
            Array.Empty<string>(),
            CancellationToken.None
        );

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
        Assert.IsInstanceOf<ObjectResult>(actual.Result);
        Assert.AreEqual(StatusCodes.Status503ServiceUnavailable, (actual.Result as ObjectResult)?.StatusCode);
    }

    [Test]
    public async Task TranslateAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.TranslateAsync(User01, Project01, string.Empty, CancellationToken.None)
            .Throws(new ForbiddenException());

        // SUT
        ActionResult<TranslationResultDto> actual = await env.Controller.TranslateAsync(
            Project01,
            Array.Empty<string>(),
            CancellationToken.None
        );

        Assert.IsInstanceOf<ForbidResult>(actual.Result);
    }

    [Test]
    public async Task TranslateAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.TranslateAsync(User01, Project01, string.Empty, CancellationToken.None)
            .Throws(new DataNotFoundException(string.Empty));

        // SUT
        ActionResult<TranslationResultDto> actual = await env.Controller.TranslateAsync(
            Project01,
            Array.Empty<string>(),
            CancellationToken.None
        );

        Assert.IsInstanceOf<NotFoundResult>(actual.Result);
    }

    [Test]
    public async Task TranslateAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.TranslateAsync(User01, Project01, string.Empty, CancellationToken.None)
            .Returns(Task.FromResult(new TranslationResult()));

        // SUT
        ActionResult<TranslationResultDto> actual = await env.Controller.TranslateAsync(
            Project01,
            Array.Empty<string>(),
            CancellationToken.None
        );

        Assert.IsInstanceOf<OkObjectResult>(actual.Result);
    }

    [Test]
    public async Task TranslateNAsync_MachineApiDown()
    {
        // Set up test environment
        const int n = 1;
        var env = new TestEnvironment();
        env.MachineApiService.TranslateNAsync(User01, Project01, n, string.Empty, CancellationToken.None)
            .Throws(new BrokenCircuitException());

        // SUT
        ActionResult<TranslationResultDto[]> actual = await env.Controller.TranslateNAsync(
            Project01,
            n,
            Array.Empty<string>(),
            CancellationToken.None
        );

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
        Assert.IsInstanceOf<ObjectResult>(actual.Result);
        Assert.AreEqual(StatusCodes.Status503ServiceUnavailable, (actual.Result as ObjectResult)?.StatusCode);
    }

    [Test]
    public async Task TranslateNAsync_NoPermission()
    {
        // Set up test environment
        const int n = 1;
        var env = new TestEnvironment();
        env.MachineApiService.TranslateNAsync(User01, Project01, n, string.Empty, CancellationToken.None)
            .Throws(new ForbiddenException());

        // SUT
        ActionResult<TranslationResultDto[]> actual = await env.Controller.TranslateNAsync(
            Project01,
            n,
            Array.Empty<string>(),
            CancellationToken.None
        );

        Assert.IsInstanceOf<ForbidResult>(actual.Result);
    }

    [Test]
    public async Task TranslateNAsync_NoProject()
    {
        // Set up test environment
        const int n = 1;
        var env = new TestEnvironment();
        env.MachineApiService.TranslateNAsync(User01, Project01, n, string.Empty, CancellationToken.None)
            .Throws(new DataNotFoundException(string.Empty));

        // SUT
        ActionResult<TranslationResultDto[]> actual = await env.Controller.TranslateNAsync(
            Project01,
            n,
            Array.Empty<string>(),
            CancellationToken.None
        );

        Assert.IsInstanceOf<NotFoundResult>(actual.Result);
    }

    [Test]
    public async Task TranslateNAsync_Success()
    {
        // Set up test environment
        const int n = 1;
        var env = new TestEnvironment();
        env.MachineApiService.TranslateNAsync(User01, Project01, n, string.Empty, CancellationToken.None)
            .Returns(Task.FromResult(Array.Empty<TranslationResult>()));

        // SUT
        ActionResult<TranslationResultDto[]> actual = await env.Controller.TranslateNAsync(
            Project01,
            n,
            Array.Empty<string>(),
            CancellationToken.None
        );

        Assert.IsInstanceOf<OkObjectResult>(actual.Result);
    }

    [Obsolete("This class will be removed when JavaScript clients have updated to the latest Machine.js")]
    private class TestEnvironment
    {
        public TestEnvironment()
        {
            var userAccessor = Substitute.For<IUserAccessor>();
            userAccessor.UserId.Returns(User01);
            ExceptionHandler = Substitute.For<IExceptionHandler>();
            MachineApiService = Substitute.For<IMachineApiService>();

            Controller = new MachineApiV2Controller(ExceptionHandler, MachineApiService, userAccessor);
        }

        public MachineApiV2Controller Controller { get; }
        public IExceptionHandler ExceptionHandler { get; }
        public IMachineApiService MachineApiService { get; }
    }
}
