using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Infrastructure;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using NUnit.Framework;
using Polly.CircuitBreaker;
using Serval.Client;
using SIL.Converters.Usj;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Controllers;

[TestFixture]
public class MachineApiControllerTests
{
    private const string Build01 = "build01";
    private const string LanguageCode = "cmn";
    private const string Project01 = "project01";
    private const string User01 = "user01";

    [Test]
    public async Task CancelPreTranslationBuildAsync_MachineApiDown()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.CancelPreTranslationBuildAsync(User01, Project01, CancellationToken.None)
            .Throws(new BrokenCircuitException());

        // SUT
        ActionResult actual = await env.Controller.CancelPreTranslationBuildAsync(Project01, CancellationToken.None);

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
        Assert.IsInstanceOf<ObjectResult>(actual);
        Assert.AreEqual(StatusCodes.Status503ServiceUnavailable, (actual as ObjectResult)?.StatusCode);
    }

    [Test]
    public async Task CancelPreTranslationBuildAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.CancelPreTranslationBuildAsync(User01, Project01, CancellationToken.None)
            .Throws(new ForbiddenException());

        // SUT
        ActionResult actual = await env.Controller.CancelPreTranslationBuildAsync(Project01, CancellationToken.None);

        Assert.IsInstanceOf<ForbidResult>(actual);
    }

    [Test]
    public async Task CancelPreTranslationBuildAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.CancelPreTranslationBuildAsync(User01, Project01, CancellationToken.None)
            .Throws(new DataNotFoundException(string.Empty));

        // SUT
        ActionResult actual = await env.Controller.CancelPreTranslationBuildAsync(Project01, CancellationToken.None);

        Assert.IsInstanceOf<NotFoundResult>(actual);
    }

    [Test]
    public async Task CancelPreTranslationBuildAsync_NotSupported()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.CancelPreTranslationBuildAsync(User01, Project01, CancellationToken.None)
            .Throws(new NotSupportedException());

        // SUT
        ActionResult actual = await env.Controller.CancelPreTranslationBuildAsync(Project01, CancellationToken.None);

        Assert.IsInstanceOf<IStatusCodeActionResult>(actual);
        Assert.AreEqual(StatusCodes.Status405MethodNotAllowed, (actual as IStatusCodeActionResult)?.StatusCode);
    }

    [Test]
    public async Task CancelPreTranslationBuildAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.CancelPreTranslationBuildAsync(User01, Project01, CancellationToken.None)
            .Returns(Task.CompletedTask);

        // SUT
        ActionResult actual = await env.Controller.CancelPreTranslationBuildAsync(Project01, CancellationToken.None);

        Assert.IsInstanceOf<OkResult>(actual);
    }

    [Test]
    public async Task GetBuildAsync_BuildEnded()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetBuildAsync(User01, Project01, Build01, null, false, false, CancellationToken.None)
            .Throws(new DataNotFoundException("Entity Deleted"));

        // SUT
        ActionResult<ServalBuildDto?> actual = await env.Controller.GetBuildAsync(
            Project01,
            Build01,
            minRevision: null,
            preTranslate: false,
            CancellationToken.None
        );

        Assert.IsInstanceOf<NotFoundResult>(actual.Result);
    }

    [Test]
    public async Task GetBuildAsync_MachineApiDown()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetBuildAsync(User01, Project01, Build01, null, false, false, CancellationToken.None)
            .Throws(new BrokenCircuitException());

        // SUT
        ActionResult<ServalBuildDto?> actual = await env.Controller.GetBuildAsync(
            Project01,
            Build01,
            minRevision: null,
            preTranslate: false,
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
        env.MachineApiService.GetBuildAsync(User01, Project01, Build01, null, false, false, CancellationToken.None)
            .Returns(Task.FromResult<ServalBuildDto>(null));

        // SUT
        ActionResult<ServalBuildDto?> actual = await env.Controller.GetBuildAsync(
            Project01,
            Build01,
            minRevision: null,
            preTranslate: false,
            CancellationToken.None
        );

        Assert.IsInstanceOf<NoContentResult>(actual.Result);
    }

    [Test]
    public async Task GetBuildAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetBuildAsync(User01, Project01, Build01, null, false, false, CancellationToken.None)
            .Throws(new ForbiddenException());

        // SUT
        ActionResult<ServalBuildDto?> actual = await env.Controller.GetBuildAsync(
            Project01,
            Build01,
            minRevision: null,
            preTranslate: false,
            CancellationToken.None
        );

        Assert.IsInstanceOf<ForbidResult>(actual.Result);
    }

    [Test]
    public async Task GetBuildAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetBuildAsync(User01, Project01, Build01, null, false, false, CancellationToken.None)
            .Throws(new DataNotFoundException(string.Empty));

        // SUT
        ActionResult<ServalBuildDto?> actual = await env.Controller.GetBuildAsync(
            Project01,
            Build01,
            minRevision: null,
            preTranslate: false,
            CancellationToken.None
        );

        Assert.IsInstanceOf<NotFoundResult>(actual.Result);
    }

    [Test]
    public async Task GetBuildAsync_MinRevisionForQueuedBuildQueriesServal()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetQueuedStateAsync(
                User01,
                Project01,
                preTranslate: false,
                isServalAdmin: false,
                CancellationToken.None
            )
            .Returns(Task.FromResult(new ServalBuildDto { State = MachineApiService.BuildStateQueued }));

        // SUT
        ActionResult<ServalBuildDto?> actual = await env.Controller.GetBuildAsync(
            Project01,
            buildId: null,
            minRevision: 1,
            preTranslate: false,
            CancellationToken.None
        );

        Assert.IsInstanceOf<NoContentResult>(actual.Result);
        await env
            .MachineApiService.Received(1)
            .GetQueuedStateAsync(User01, Project01, preTranslate: false, isServalAdmin: false, CancellationToken.None);
        await env
            .MachineApiService.Received(1)
            .GetCurrentBuildAsync(
                User01,
                Project01,
                minRevision: 1,
                preTranslate: false,
                isServalAdmin: false,
                CancellationToken.None
            );
        await env
            .MachineApiService.DidNotReceiveWithAnyArgs()
            .GetBuildAsync(
                User01,
                Project01,
                Build01,
                minRevision: default,
                preTranslate: default,
                isServalAdmin: default,
                CancellationToken.None
            );
    }

    [Test]
    public async Task GetBuildAsync_PreTranslationQueued()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetQueuedStateAsync(
                User01,
                Project01,
                preTranslate: true,
                isServalAdmin: false,
                CancellationToken.None
            )
            .Returns(Task.FromResult(new ServalBuildDto()));

        // SUT
        ActionResult<ServalBuildDto?> actual = await env.Controller.GetBuildAsync(
            Project01,
            buildId: null,
            minRevision: null,
            preTranslate: true,
            CancellationToken.None
        );

        Assert.IsInstanceOf<OkObjectResult>(actual.Result);
        await env
            .MachineApiService.Received(1)
            .GetQueuedStateAsync(User01, Project01, preTranslate: true, isServalAdmin: false, CancellationToken.None);
        await env
            .MachineApiService.DidNotReceiveWithAnyArgs()
            .GetCurrentBuildAsync(User01, Project01, null, true, false, CancellationToken.None);
        await env
            .MachineApiService.DidNotReceiveWithAnyArgs()
            .GetBuildAsync(User01, Project01, Build01, null, true, false, CancellationToken.None);
    }

    [Test]
    public async Task GetBuildAsync_PreTranslationNotQueued()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetCurrentBuildAsync(User01, Project01, null, true, false, CancellationToken.None)
            .Returns(Task.FromResult(new ServalBuildDto()));

        // SUT
        ActionResult<ServalBuildDto?> actual = await env.Controller.GetBuildAsync(
            Project01,
            buildId: null,
            minRevision: null,
            preTranslate: true,
            CancellationToken.None
        );

        Assert.IsInstanceOf<OkObjectResult>(actual.Result);
        await env
            .MachineApiService.Received(1)
            .GetQueuedStateAsync(User01, Project01, preTranslate: true, isServalAdmin: false, CancellationToken.None);
        await env
            .MachineApiService.Received(1)
            .GetCurrentBuildAsync(User01, Project01, null, true, false, CancellationToken.None);
        await env
            .MachineApiService.DidNotReceiveWithAnyArgs()
            .GetBuildAsync(User01, Project01, Build01, null, true, false, CancellationToken.None);
    }

    [Test]
    public async Task GetBuildAsync_PreTranslationSpecificBuild()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetBuildAsync(User01, Project01, Build01, null, true, false, CancellationToken.None)
            .Returns(Task.FromResult(new ServalBuildDto()));

        // SUT
        ActionResult<ServalBuildDto?> actual = await env.Controller.GetBuildAsync(
            Project01,
            Build01,
            minRevision: null,
            preTranslate: true,
            CancellationToken.None
        );

        Assert.IsInstanceOf<OkObjectResult>(actual.Result);
        await env
            .MachineApiService.DidNotReceiveWithAnyArgs()
            .GetQueuedStateAsync(User01, Project01, preTranslate: true, isServalAdmin: false, CancellationToken.None);
        await env
            .MachineApiService.DidNotReceiveWithAnyArgs()
            .GetCurrentBuildAsync(User01, Project01, null, true, false, CancellationToken.None);
        await env
            .MachineApiService.Received(1)
            .GetBuildAsync(User01, Project01, Build01, null, true, false, CancellationToken.None);
    }

    [Test]
    public async Task GetBuildAsync_ServalAdmin()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetBuildAsync(User01, Project01, Build01, null, true, true, CancellationToken.None)
            .Returns(Task.FromResult(new ServalBuildDto()));
        env.UserAccessor.SystemRoles.Returns([SystemRole.ServalAdmin]);

        // SUT
        ActionResult<ServalBuildDto?> actual = await env.Controller.GetBuildAsync(
            Project01,
            Build01,
            minRevision: null,
            preTranslate: true,
            CancellationToken.None
        );

        Assert.IsInstanceOf<OkObjectResult>(actual.Result);
        await env
            .MachineApiService.Received(1)
            .GetBuildAsync(User01, Project01, Build01, null, true, true, CancellationToken.None);
    }

    [Test]
    public async Task GetBuildAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetBuildAsync(User01, Project01, Build01, null, false, false, CancellationToken.None)
            .Returns(Task.FromResult(new ServalBuildDto()));

        // SUT
        ActionResult<ServalBuildDto?> actual = await env.Controller.GetBuildAsync(
            Project01,
            Build01,
            minRevision: null,
            preTranslate: false,
            CancellationToken.None
        );

        Assert.IsInstanceOf<OkObjectResult>(actual.Result);
        await env
            .MachineApiService.Received(1)
            .GetBuildAsync(User01, Project01, Build01, null, false, false, CancellationToken.None);
    }

    [Test]
    public async Task GetBuildAsync_NoBuildIdBuildEnded()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetCurrentBuildAsync(User01, Project01, null, false, false, CancellationToken.None)
            .Throws(new DataNotFoundException("Entity Deleted"));

        // SUT
        ActionResult<ServalBuildDto?> actual = await env.Controller.GetBuildAsync(
            Project01,
            buildId: null,
            minRevision: null,
            preTranslate: false,
            CancellationToken.None
        );

        Assert.IsInstanceOf<NotFoundResult>(actual.Result);
    }

    [Test]
    public async Task GetBuildAsync_NoBuildIdMachineApiDown()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetCurrentBuildAsync(User01, Project01, null, false, false, CancellationToken.None)
            .Throws(new BrokenCircuitException());

        // SUT
        ActionResult<ServalBuildDto?> actual = await env.Controller.GetBuildAsync(
            Project01,
            buildId: null,
            minRevision: null,
            preTranslate: false,
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
        env.MachineApiService.GetCurrentBuildAsync(User01, Project01, null, false, false, CancellationToken.None)
            .Returns(Task.FromResult<ServalBuildDto>(null));

        // SUT
        ActionResult<ServalBuildDto?> actual = await env.Controller.GetBuildAsync(
            Project01,
            buildId: null,
            minRevision: null,
            preTranslate: false,
            CancellationToken.None
        );

        Assert.IsInstanceOf<NoContentResult>(actual.Result);
    }

    [Test]
    public async Task GetBuildAsync_NoBuildIdNoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetCurrentBuildAsync(User01, Project01, null, false, false, CancellationToken.None)
            .Throws(new ForbiddenException());

        // SUT
        ActionResult<ServalBuildDto?> actual = await env.Controller.GetBuildAsync(
            Project01,
            buildId: null,
            minRevision: null,
            preTranslate: false,
            CancellationToken.None
        );

        Assert.IsInstanceOf<ForbidResult>(actual.Result);
    }

    [Test]
    public async Task GetBuildAsync_NoBuildIdNoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetCurrentBuildAsync(User01, Project01, null, false, false, CancellationToken.None)
            .Throws(new DataNotFoundException(string.Empty));

        // SUT
        ActionResult<ServalBuildDto?> actual = await env.Controller.GetBuildAsync(
            Project01,
            buildId: null,
            minRevision: null,
            preTranslate: false,
            CancellationToken.None
        );

        Assert.IsInstanceOf<NotFoundResult>(actual.Result);
    }

    [Test]
    public async Task GetBuildAsync_NoBuildIdSuccess()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetCurrentBuildAsync(User01, Project01, null, false, false, CancellationToken.None)
            .Returns(Task.FromResult(new ServalBuildDto()));

        // SUT
        ActionResult<ServalBuildDto?> actual = await env.Controller.GetBuildAsync(
            Project01,
            buildId: null,
            minRevision: null,
            preTranslate: false,
            CancellationToken.None
        );

        Assert.IsInstanceOf<OkObjectResult>(actual.Result);
        await env
            .MachineApiService.Received(1)
            .GetCurrentBuildAsync(User01, Project01, null, false, false, CancellationToken.None);
    }

    [Test]
    public async Task GetEngineAsync_MachineApiDown()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetEngineAsync(User01, Project01, CancellationToken.None)
            .Throws(new BrokenCircuitException());

        // SUT
        ActionResult<ServalEngineDto> actual = await env.Controller.GetEngineAsync(Project01, CancellationToken.None);

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
        ActionResult<ServalEngineDto> actual = await env.Controller.GetEngineAsync(Project01, CancellationToken.None);

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
        ActionResult<ServalEngineDto> actual = await env.Controller.GetEngineAsync(Project01, CancellationToken.None);

        Assert.IsInstanceOf<NotFoundResult>(actual.Result);
    }

    [Test]
    public async Task GetEngineAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetEngineAsync(User01, Project01, CancellationToken.None)
            .Returns(Task.FromResult(new ServalEngineDto()));

        // SUT
        ActionResult<ServalEngineDto> actual = await env.Controller.GetEngineAsync(Project01, CancellationToken.None);

        Assert.IsInstanceOf<OkObjectResult>(actual.Result);
    }

    [Test]
    public async Task GetLastCompletedPreTranslationBuildAsync_MachineApiDown()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetLastCompletedPreTranslationBuildAsync(User01, Project01, false, CancellationToken.None)
            .Throws(new BrokenCircuitException());

        // SUT
        ActionResult<ServalBuildDto?> actual = await env.Controller.GetLastCompletedPreTranslationBuildAsync(
            Project01,
            CancellationToken.None
        );

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
        Assert.IsInstanceOf<ObjectResult>(actual.Result);
        Assert.AreEqual(StatusCodes.Status503ServiceUnavailable, (actual.Result as ObjectResult)?.StatusCode);
    }

    [Test]
    public async Task GetLastCompletedPreTranslationBuildAsync_NoCompletedBuild()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetLastCompletedPreTranslationBuildAsync(User01, Project01, false, CancellationToken.None)
            .Returns(Task.FromResult<ServalBuildDto>(null));

        // SUT
        ActionResult<ServalBuildDto?> actual = await env.Controller.GetLastCompletedPreTranslationBuildAsync(
            Project01,
            CancellationToken.None
        );

        Assert.IsInstanceOf<NoContentResult>(actual.Result);
    }

    [Test]
    public async Task GetLastCompletedPreTranslationBuildAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetLastCompletedPreTranslationBuildAsync(User01, Project01, false, CancellationToken.None)
            .Throws(new ForbiddenException());

        // SUT
        ActionResult<ServalBuildDto?> actual = await env.Controller.GetLastCompletedPreTranslationBuildAsync(
            Project01,
            CancellationToken.None
        );

        Assert.IsInstanceOf<ForbidResult>(actual.Result);
    }

    [Test]
    public async Task GetLastCompletedPreTranslationBuildAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetLastCompletedPreTranslationBuildAsync(User01, Project01, false, CancellationToken.None)
            .Throws(new DataNotFoundException(string.Empty));

        // SUT
        ActionResult<ServalBuildDto?> actual = await env.Controller.GetLastCompletedPreTranslationBuildAsync(
            Project01,
            CancellationToken.None
        );

        Assert.IsInstanceOf<NotFoundResult>(actual.Result);
    }

    [Test]
    public async Task GetLastCompletedPreTranslationBuildAsync_ServalAdmin()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetLastCompletedPreTranslationBuildAsync(User01, Project01, true, CancellationToken.None)
            .Returns(Task.FromResult(new ServalBuildDto()));
        env.UserAccessor.SystemRoles.Returns([SystemRole.ServalAdmin]);

        // SUT
        ActionResult<ServalBuildDto?> actual = await env.Controller.GetLastCompletedPreTranslationBuildAsync(
            Project01,
            CancellationToken.None
        );

        Assert.IsInstanceOf<OkObjectResult>(actual.Result);

        await env
            .MachineApiService.Received(1)
            .GetLastCompletedPreTranslationBuildAsync(User01, Project01, true, CancellationToken.None);
    }

    [Test]
    public async Task GetLastCompletedPreTranslationBuildAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetLastCompletedPreTranslationBuildAsync(User01, Project01, false, CancellationToken.None)
            .Returns(Task.FromResult(new ServalBuildDto()));

        // SUT
        ActionResult<ServalBuildDto?> actual = await env.Controller.GetLastCompletedPreTranslationBuildAsync(
            Project01,
            CancellationToken.None
        );

        Assert.IsInstanceOf<OkObjectResult>(actual.Result);

        await env
            .MachineApiService.Received(1)
            .GetLastCompletedPreTranslationBuildAsync(User01, Project01, false, CancellationToken.None);
    }

    [Test]
    public async Task GetPreTranslationAsync_MachineApiDown()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetPreTranslationAsync(User01, Project01, 40, 1, CancellationToken.None)
            .Throws(new BrokenCircuitException());

        // SUT
        ActionResult<PreTranslationDto> actual = await env.Controller.GetPreTranslationAsync(
            Project01,
            40,
            1,
            CancellationToken.None
        );

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
        Assert.IsInstanceOf<ObjectResult>(actual.Result);
        Assert.AreEqual(StatusCodes.Status503ServiceUnavailable, (actual.Result as ObjectResult)?.StatusCode);
    }

    [Test]
    public async Task GetPreTranslationAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetPreTranslationAsync(User01, Project01, 40, 1, CancellationToken.None)
            .Throws(new ForbiddenException());

        // SUT
        ActionResult<PreTranslationDto> actual = await env.Controller.GetPreTranslationAsync(
            Project01,
            40,
            1,
            CancellationToken.None
        );

        Assert.IsInstanceOf<ForbidResult>(actual.Result);
    }

    [Test]
    public async Task GetPreTranslationAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetPreTranslationAsync(User01, Project01, 40, 1, CancellationToken.None)
            .Throws(new DataNotFoundException(string.Empty));

        // SUT
        ActionResult<PreTranslationDto> actual = await env.Controller.GetPreTranslationAsync(
            Project01,
            40,
            1,
            CancellationToken.None
        );

        Assert.IsInstanceOf<NotFoundResult>(actual.Result);
    }

    [Test]
    public async Task GetPreTranslationAsync_NotBuilt()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetPreTranslationAsync(User01, Project01, 40, 1, CancellationToken.None)
            .Throws(new InvalidOperationException());

        // SUT
        ActionResult<PreTranslationDto> actual = await env.Controller.GetPreTranslationAsync(
            Project01,
            40,
            1,
            CancellationToken.None
        );

        Assert.IsInstanceOf<ConflictResult>(actual.Result);
    }

    [Test]
    public async Task GetPreTranslationAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetPreTranslationAsync(User01, Project01, 40, 1, CancellationToken.None)
            .Returns(Task.FromResult(new PreTranslationDto()));

        // SUT
        ActionResult<PreTranslationDto> actual = await env.Controller.GetPreTranslationAsync(
            Project01,
            40,
            1,
            CancellationToken.None
        );

        Assert.IsInstanceOf<OkObjectResult>(actual.Result);
    }

    [Test]
    public async Task GetPreTranslationDeltaAsync_MachineApiDown()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetPreTranslationDeltaAsync(
                User01,
                Project01,
                40,
                1,
                false,
                Arg.Any<DateTime>(),
                CancellationToken.None
            )
            .Throws(new BrokenCircuitException());

        // SUT
        ActionResult<Snapshot<TextData>> actual = await env.Controller.GetPreTranslationDeltaAsync(
            Project01,
            40,
            1,
            null,
            CancellationToken.None
        );

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
        Assert.IsInstanceOf<ObjectResult>(actual.Result);
        Assert.AreEqual(StatusCodes.Status503ServiceUnavailable, (actual.Result as ObjectResult)?.StatusCode);
    }

    [Test]
    public async Task GetPreTranslationDeltaAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetPreTranslationDeltaAsync(
                User01,
                Project01,
                40,
                1,
                false,
                Arg.Any<DateTime>(),
                CancellationToken.None
            )
            .Throws(new ForbiddenException());

        // SUT
        ActionResult<Snapshot<TextData>> actual = await env.Controller.GetPreTranslationDeltaAsync(
            Project01,
            40,
            1,
            null,
            CancellationToken.None
        );

        Assert.IsInstanceOf<ForbidResult>(actual.Result);
    }

    [Test]
    public async Task GetPreTranslationDeltaAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetPreTranslationDeltaAsync(
                User01,
                Project01,
                40,
                1,
                false,
                Arg.Any<DateTime>(),
                CancellationToken.None
            )
            .Throws(new DataNotFoundException(string.Empty));

        // SUT
        ActionResult<Snapshot<TextData>> actual = await env.Controller.GetPreTranslationDeltaAsync(
            Project01,
            40,
            1,
            null,
            CancellationToken.None
        );

        Assert.IsInstanceOf<NotFoundResult>(actual.Result);
    }

    [Test]
    public async Task GetPreTranslationDeltaAsync_NotBuilt()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetPreTranslationDeltaAsync(
                User01,
                Project01,
                40,
                1,
                false,
                Arg.Any<DateTime>(),
                CancellationToken.None
            )
            .Throws(new InvalidOperationException());

        // SUT
        ActionResult<Snapshot<TextData>> actual = await env.Controller.GetPreTranslationDeltaAsync(
            Project01,
            40,
            1,
            null,
            CancellationToken.None
        );

        Assert.IsInstanceOf<ConflictResult>(actual.Result);
    }

    [Test]
    public async Task GetPreTranslationDeltaAsync_NotSupported()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetPreTranslationDeltaAsync(
                User01,
                Project01,
                40,
                1,
                false,
                Arg.Any<DateTime>(),
                CancellationToken.None
            )
            .Throws(new NotSupportedException());

        // SUT
        ActionResult<Snapshot<TextData>> actual = await env.Controller.GetPreTranslationDeltaAsync(
            Project01,
            40,
            1,
            null,
            CancellationToken.None
        );

        Assert.IsInstanceOf<IStatusCodeActionResult>(actual.Result);
        Assert.AreEqual(StatusCodes.Status405MethodNotAllowed, (actual.Result as IStatusCodeActionResult)?.StatusCode);
    }

    [Test]
    public async Task GetPreTranslationDeltaAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetPreTranslationDeltaAsync(
                User01,
                Project01,
                40,
                1,
                false,
                Arg.Any<DateTime>(),
                CancellationToken.None
            )
            .Returns(Task.FromResult(new Snapshot<TextData>()));

        // SUT
        ActionResult<Snapshot<TextData>> actual = await env.Controller.GetPreTranslationDeltaAsync(
            Project01,
            40,
            1,
            null,
            CancellationToken.None
        );

        Assert.IsInstanceOf<OkObjectResult>(actual.Result);
    }

    [Test]
    public async Task GetPreTranslationUsfmAsync_MachineApiDown()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetPreTranslationUsfmAsync(
                User01,
                Project01,
                40,
                1,
                false,
                Arg.Any<DateTime>(),
                CancellationToken.None
            )
            .Throws(new BrokenCircuitException());

        // SUT
        ActionResult<string> actual = await env.Controller.GetPreTranslationUsfmAsync(
            Project01,
            40,
            1,
            null,
            CancellationToken.None
        );

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
        Assert.IsInstanceOf<ObjectResult>(actual.Result);
        Assert.AreEqual(StatusCodes.Status503ServiceUnavailable, (actual.Result as ObjectResult)?.StatusCode);
    }

    [Test]
    public async Task GetPreTranslationUsfmAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetPreTranslationUsfmAsync(
                User01,
                Project01,
                40,
                1,
                false,
                Arg.Any<DateTime>(),
                CancellationToken.None
            )
            .Throws(new ForbiddenException());

        // SUT
        ActionResult<string> actual = await env.Controller.GetPreTranslationUsfmAsync(
            Project01,
            40,
            1,
            null,
            CancellationToken.None
        );

        Assert.IsInstanceOf<ForbidResult>(actual.Result);
    }

    [Test]
    public async Task GetPreTranslationUsfmAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetPreTranslationUsfmAsync(
                User01,
                Project01,
                40,
                1,
                false,
                Arg.Any<DateTime>(),
                CancellationToken.None
            )
            .Throws(new DataNotFoundException(string.Empty));

        // SUT
        ActionResult<string> actual = await env.Controller.GetPreTranslationUsfmAsync(
            Project01,
            40,
            1,
            null,
            CancellationToken.None
        );

        Assert.IsInstanceOf<NotFoundResult>(actual.Result);
    }

    [Test]
    public async Task GetPreTranslationUsfmAsync_NotBuilt()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetPreTranslationUsfmAsync(
                User01,
                Project01,
                40,
                1,
                false,
                Arg.Any<DateTime>(),
                CancellationToken.None
            )
            .Throws(new InvalidOperationException());

        // SUT
        ActionResult<string> actual = await env.Controller.GetPreTranslationUsfmAsync(
            Project01,
            40,
            1,
            null,
            CancellationToken.None
        );

        Assert.IsInstanceOf<ConflictResult>(actual.Result);
    }

    [Test]
    public async Task GetPreTranslationUsfmAsync_NotSupported()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetPreTranslationUsfmAsync(
                User01,
                Project01,
                40,
                1,
                false,
                Arg.Any<DateTime>(),
                CancellationToken.None
            )
            .Throws(new NotSupportedException());

        // SUT
        ActionResult<string> actual = await env.Controller.GetPreTranslationUsfmAsync(
            Project01,
            40,
            1,
            null,
            CancellationToken.None
        );

        Assert.IsInstanceOf<IStatusCodeActionResult>(actual.Result);
        Assert.AreEqual(StatusCodes.Status405MethodNotAllowed, (actual.Result as IStatusCodeActionResult)?.StatusCode);
    }

    [Test]
    public async Task GetPreTranslationUsfmAsync_ServalAdmin()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetPreTranslationUsfmAsync(
                User01,
                Project01,
                40,
                1,
                true,
                Arg.Any<DateTime>(),
                CancellationToken.None
            )
            .Returns(Task.FromResult(string.Empty));
        env.UserAccessor.SystemRoles.Returns([SystemRole.ServalAdmin]);

        // SUT
        ActionResult<string> actual = await env.Controller.GetPreTranslationUsfmAsync(
            Project01,
            40,
            1,
            null,
            CancellationToken.None
        );

        Assert.IsInstanceOf<OkObjectResult>(actual.Result);

        await env
            .MachineApiService.Received(1)
            .GetPreTranslationUsfmAsync(User01, Project01, 40, 1, true, Arg.Any<DateTime>(), CancellationToken.None);
    }

    [Test]
    public async Task GetPreTranslationUsfmAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetPreTranslationUsfmAsync(
                User01,
                Project01,
                40,
                1,
                false,
                Arg.Any<DateTime>(),
                CancellationToken.None
            )
            .Returns(Task.FromResult(string.Empty));

        // SUT
        ActionResult<string> actual = await env.Controller.GetPreTranslationUsfmAsync(
            Project01,
            40,
            1,
            null,
            CancellationToken.None
        );

        Assert.IsInstanceOf<OkObjectResult>(actual.Result);

        await env
            .MachineApiService.Received(1)
            .GetPreTranslationUsfmAsync(User01, Project01, 40, 1, false, Arg.Any<DateTime>(), CancellationToken.None);
    }

    [Test]
    public async Task GetPreTranslationUsjAsync_MachineApiDown()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetPreTranslationUsjAsync(
                User01,
                Project01,
                40,
                1,
                false,
                Arg.Any<DateTime>(),
                CancellationToken.None
            )
            .Throws(new BrokenCircuitException());

        // SUT
        ActionResult<Usj> actual = await env.Controller.GetPreTranslationUsjAsync(
            Project01,
            40,
            1,
            null,
            CancellationToken.None
        );

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
        Assert.IsInstanceOf<ObjectResult>(actual.Result);
        Assert.AreEqual(StatusCodes.Status503ServiceUnavailable, (actual.Result as ObjectResult)?.StatusCode);
    }

    [Test]
    public async Task GetPreTranslationUsjAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetPreTranslationUsjAsync(
                User01,
                Project01,
                40,
                1,
                false,
                Arg.Any<DateTime>(),
                CancellationToken.None
            )
            .Throws(new ForbiddenException());

        // SUT
        ActionResult<Usj> actual = await env.Controller.GetPreTranslationUsjAsync(
            Project01,
            40,
            1,
            null,
            CancellationToken.None
        );

        Assert.IsInstanceOf<ForbidResult>(actual.Result);
    }

    [Test]
    public async Task GetPreTranslationUsjAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetPreTranslationUsjAsync(
                User01,
                Project01,
                40,
                1,
                false,
                Arg.Any<DateTime>(),
                CancellationToken.None
            )
            .Throws(new DataNotFoundException(string.Empty));

        // SUT
        ActionResult<Usj> actual = await env.Controller.GetPreTranslationUsjAsync(
            Project01,
            40,
            1,
            null,
            CancellationToken.None
        );

        Assert.IsInstanceOf<NotFoundResult>(actual.Result);
    }

    [Test]
    public async Task GetPreTranslationUsjAsync_NotBuilt()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetPreTranslationUsjAsync(
                User01,
                Project01,
                40,
                1,
                false,
                Arg.Any<DateTime>(),
                CancellationToken.None
            )
            .Throws(new InvalidOperationException());

        // SUT
        ActionResult<Usj> actual = await env.Controller.GetPreTranslationUsjAsync(
            Project01,
            40,
            1,
            null,
            CancellationToken.None
        );

        Assert.IsInstanceOf<ConflictResult>(actual.Result);
    }

    [Test]
    public async Task GetPreTranslationUsjAsync_NotSupported()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetPreTranslationUsjAsync(
                User01,
                Project01,
                40,
                1,
                false,
                Arg.Any<DateTime>(),
                CancellationToken.None
            )
            .Throws(new NotSupportedException());

        // SUT
        ActionResult<Usj> actual = await env.Controller.GetPreTranslationUsjAsync(
            Project01,
            40,
            1,
            null,
            CancellationToken.None
        );

        Assert.IsInstanceOf<IStatusCodeActionResult>(actual.Result);
        Assert.AreEqual(StatusCodes.Status405MethodNotAllowed, (actual.Result as IStatusCodeActionResult)?.StatusCode);
    }

    [Test]
    public async Task GetPreTranslationUsjAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetPreTranslationUsjAsync(
                User01,
                Project01,
                40,
                1,
                false,
                Arg.Any<DateTime>(),
                CancellationToken.None
            )
            .Returns(Task.FromResult(new Usj()));

        // SUT
        ActionResult<Usj> actual = await env.Controller.GetPreTranslationUsjAsync(
            Project01,
            40,
            1,
            null,
            CancellationToken.None
        );

        Assert.IsInstanceOf<OkObjectResult>(actual.Result);
    }

    [Test]
    public async Task GetPreTranslationUsxAsync_MachineApiDown()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetPreTranslationUsxAsync(
                User01,
                Project01,
                40,
                1,
                false,
                Arg.Any<DateTime>(),
                CancellationToken.None
            )
            .Throws(new BrokenCircuitException());

        // SUT
        ActionResult<string> actual = await env.Controller.GetPreTranslationUsxAsync(
            Project01,
            40,
            1,
            null,
            CancellationToken.None
        );

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
        Assert.IsInstanceOf<ObjectResult>(actual.Result);
        Assert.AreEqual(StatusCodes.Status503ServiceUnavailable, (actual.Result as ObjectResult)?.StatusCode);
    }

    [Test]
    public async Task GetPreTranslationUsxAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetPreTranslationUsxAsync(
                User01,
                Project01,
                40,
                1,
                false,
                Arg.Any<DateTime>(),
                CancellationToken.None
            )
            .Throws(new ForbiddenException());

        // SUT
        ActionResult<string> actual = await env.Controller.GetPreTranslationUsxAsync(
            Project01,
            40,
            1,
            null,
            CancellationToken.None
        );

        Assert.IsInstanceOf<ForbidResult>(actual.Result);
    }

    [Test]
    public async Task GetPreTranslationUsxAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetPreTranslationUsxAsync(
                User01,
                Project01,
                40,
                1,
                false,
                Arg.Any<DateTime>(),
                CancellationToken.None
            )
            .Throws(new DataNotFoundException(string.Empty));

        // SUT
        ActionResult<string> actual = await env.Controller.GetPreTranslationUsxAsync(
            Project01,
            40,
            1,
            null,
            CancellationToken.None
        );

        Assert.IsInstanceOf<NotFoundResult>(actual.Result);
    }

    [Test]
    public async Task GetPreTranslationUsxAsync_NotBuilt()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetPreTranslationUsxAsync(
                User01,
                Project01,
                40,
                1,
                false,
                Arg.Any<DateTime>(),
                CancellationToken.None
            )
            .Throws(new InvalidOperationException());

        // SUT
        ActionResult<string> actual = await env.Controller.GetPreTranslationUsxAsync(
            Project01,
            40,
            1,
            null,
            CancellationToken.None
        );

        Assert.IsInstanceOf<ConflictResult>(actual.Result);
    }

    [Test]
    public async Task GetPreTranslationUsxAsync_NotSupported()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetPreTranslationUsxAsync(
                User01,
                Project01,
                40,
                1,
                false,
                Arg.Any<DateTime>(),
                CancellationToken.None
            )
            .Throws(new NotSupportedException());

        // SUT
        ActionResult<string> actual = await env.Controller.GetPreTranslationUsxAsync(
            Project01,
            40,
            1,
            null,
            CancellationToken.None
        );

        Assert.IsInstanceOf<IStatusCodeActionResult>(actual.Result);
        Assert.AreEqual(StatusCodes.Status405MethodNotAllowed, (actual.Result as IStatusCodeActionResult)?.StatusCode);
    }

    [Test]
    public async Task GetPreTranslationUsxAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetPreTranslationUsxAsync(
                User01,
                Project01,
                40,
                1,
                false,
                Arg.Any<DateTime>(),
                CancellationToken.None
            )
            .Returns(Task.FromResult(string.Empty));

        // SUT
        ActionResult<string> actual = await env.Controller.GetPreTranslationUsxAsync(
            Project01,
            40,
            1,
            null,
            CancellationToken.None
        );

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
        ActionResult<WordGraph> actual = await env.Controller.GetWordGraphAsync(
            Project01,
            string.Empty,
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
        ActionResult<WordGraph> actual = await env.Controller.GetWordGraphAsync(
            Project01,
            string.Empty,
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
        ActionResult<WordGraph> actual = await env.Controller.GetWordGraphAsync(
            Project01,
            string.Empty,
            CancellationToken.None
        );

        Assert.IsInstanceOf<NotFoundResult>(actual.Result);
    }

    [Test]
    public async Task GetWordGraphAsync_NotBuilt()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetWordGraphAsync(User01, Project01, string.Empty, CancellationToken.None)
            .Throws(new InvalidOperationException());

        // SUT
        ActionResult<WordGraph> actual = await env.Controller.GetWordGraphAsync(
            Project01,
            string.Empty,
            CancellationToken.None
        );

        Assert.IsInstanceOf<ConflictResult>(actual.Result);
    }

    [Test]
    public async Task GetWordGraphAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.GetWordGraphAsync(User01, Project01, string.Empty, CancellationToken.None)
            .Returns(Task.FromResult(new WordGraph()));

        // SUT
        ActionResult<WordGraph> actual = await env.Controller.GetWordGraphAsync(
            Project01,
            string.Empty,
            CancellationToken.None
        );

        Assert.IsInstanceOf<OkObjectResult>(actual.Result);
    }

    [Test]
    public async Task IsLanguageSupportedAsync_MachineApiDown()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.IsLanguageSupportedAsync(LanguageCode, CancellationToken.None)
            .Throws(new BrokenCircuitException());

        // SUT
        ActionResult<LanguageDto> actual = await env.Controller.IsLanguageSupportedAsync(
            LanguageCode,
            CancellationToken.None
        );

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
        Assert.IsInstanceOf<ObjectResult>(actual.Result);
        Assert.AreEqual(StatusCodes.Status503ServiceUnavailable, (actual.Result as ObjectResult)?.StatusCode);
    }

    [Test]
    public async Task IsLanguageSupportedAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.IsLanguageSupportedAsync(LanguageCode, CancellationToken.None)
            .Returns(Task.FromResult(new LanguageDto()));

        // SUT
        ActionResult<LanguageDto> actual = await env.Controller.IsLanguageSupportedAsync(
            LanguageCode,
            CancellationToken.None
        );

        Assert.IsInstanceOf<OkObjectResult>(actual.Result);
        await env.MachineApiService.Received(1).IsLanguageSupportedAsync(LanguageCode, CancellationToken.None);
    }

    [Test]
    public async Task StartBuildAsync_MachineApiDown()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.StartBuildAsync(User01, Project01, CancellationToken.None)
            .Throws(new BrokenCircuitException());

        // SUT
        ActionResult actual = await env.Controller.StartBuildAsync(Project01, CancellationToken.None);

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
        Assert.IsInstanceOf<ObjectResult>(actual);
        Assert.AreEqual(StatusCodes.Status503ServiceUnavailable, (actual as ObjectResult)?.StatusCode);
    }

    [Test]
    public async Task StartBuildAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.StartBuildAsync(User01, Project01, CancellationToken.None)
            .Throws(new ForbiddenException());

        // SUT
        ActionResult actual = await env.Controller.StartBuildAsync(Project01, CancellationToken.None);

        Assert.IsInstanceOf<ForbidResult>(actual);
    }

    [Test]
    public async Task StartBuildAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.StartBuildAsync(User01, Project01, CancellationToken.None)
            .Throws(new DataNotFoundException(string.Empty));

        // SUT
        ActionResult actual = await env.Controller.StartBuildAsync(Project01, CancellationToken.None);

        Assert.IsInstanceOf<NotFoundResult>(actual);
    }

    [Test]
    public async Task StartBuildAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.StartBuildAsync(User01, Project01, CancellationToken.None)
            .Returns(Task.FromResult(new ServalBuildDto()));

        // SUT
        ActionResult actual = await env.Controller.StartBuildAsync(Project01, CancellationToken.None);

        Assert.IsInstanceOf<OkObjectResult>(actual);
        await env.MachineApiService.Received(1).StartBuildAsync(User01, Project01, CancellationToken.None);
    }

    [Test]
    public async Task StartBuildAsync_Unauthorized()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.StartBuildAsync(User01, Project01, CancellationToken.None)
            .Throws(new UnauthorizedAccessException());

        // SUT
        ActionResult actual = await env.Controller.StartBuildAsync(Project01, CancellationToken.None);

        Assert.IsInstanceOf<UnauthorizedResult>(actual);
    }

    [Test]
    public async Task StartPreTranslationBuildAsync_MachineApiDown()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.StartPreTranslationBuildAsync(
                User01,
                Arg.Is<BuildConfig>(p => p.ProjectId == Project01),
                CancellationToken.None
            )
            .Throws(new BrokenCircuitException());

        // SUT
        ActionResult actual = await env.Controller.StartPreTranslationBuildAsync(
            new BuildConfig { ProjectId = Project01 },
            CancellationToken.None
        );

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
        Assert.IsInstanceOf<ObjectResult>(actual);
        Assert.AreEqual(StatusCodes.Status503ServiceUnavailable, (actual as ObjectResult)?.StatusCode);
    }

    [Test]
    public async Task StartPreTranslationBuildAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.StartPreTranslationBuildAsync(
                User01,
                Arg.Is<BuildConfig>(p => p.ProjectId == Project01),
                CancellationToken.None
            )
            .Throws(new ForbiddenException());

        // SUT
        ActionResult actual = await env.Controller.StartPreTranslationBuildAsync(
            new BuildConfig { ProjectId = Project01 },
            CancellationToken.None
        );

        Assert.IsInstanceOf<ForbidResult>(actual);
    }

    [Test]
    public async Task StartPreTranslationBuildAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.StartPreTranslationBuildAsync(
                User01,
                Arg.Is<BuildConfig>(p => p.ProjectId == Project01),
                CancellationToken.None
            )
            .Throws(new DataNotFoundException(string.Empty));

        // SUT
        ActionResult actual = await env.Controller.StartPreTranslationBuildAsync(
            new BuildConfig { ProjectId = Project01 },
            CancellationToken.None
        );

        Assert.IsInstanceOf<NotFoundResult>(actual);
    }

    [Test]
    public async Task StartPreTranslationBuildAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.StartPreTranslationBuildAsync(
                User01,
                new BuildConfig { ProjectId = Project01 },
                CancellationToken.None
            )
            .Returns(Task.CompletedTask);

        // SUT
        ActionResult actual = await env.Controller.StartPreTranslationBuildAsync(
            new BuildConfig { ProjectId = Project01 },
            CancellationToken.None
        );

        Assert.IsInstanceOf<OkResult>(actual);
    }

    [Test]
    public async Task StartPreTranslationBuildAsync_Unauthorized()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.StartPreTranslationBuildAsync(
                User01,
                Arg.Is<BuildConfig>(p => p.ProjectId == Project01),
                CancellationToken.None
            )
            .Throws(new UnauthorizedAccessException());

        // SUT
        ActionResult actual = await env.Controller.StartPreTranslationBuildAsync(
            new BuildConfig { ProjectId = Project01 },
            CancellationToken.None
        );

        Assert.IsInstanceOf<UnauthorizedResult>(actual);
    }

    [Test]
    public async Task TrainSegmentAsync_MachineApiDown()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var segmentPair = new SegmentPair();
        env.MachineApiService.TrainSegmentAsync(User01, Project01, segmentPair, CancellationToken.None)
            .Throws(new BrokenCircuitException());

        // SUT
        ActionResult actual = await env.Controller.TrainSegmentAsync(Project01, segmentPair, CancellationToken.None);

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<BrokenCircuitException>());
        Assert.IsInstanceOf<ObjectResult>(actual);
        Assert.AreEqual(StatusCodes.Status503ServiceUnavailable, (actual as ObjectResult)?.StatusCode);
    }

    [Test]
    public async Task TrainSegmentAsync_NoPermission()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var segmentPair = new SegmentPair();
        env.MachineApiService.TrainSegmentAsync(User01, Project01, segmentPair, CancellationToken.None)
            .Throws(new ForbiddenException());

        // SUT
        ActionResult actual = await env.Controller.TrainSegmentAsync(Project01, segmentPair, CancellationToken.None);

        Assert.IsInstanceOf<ForbidResult>(actual);
    }

    [Test]
    public async Task TrainSegmentAsync_NoProject()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var segmentPair = new SegmentPair();
        env.MachineApiService.TrainSegmentAsync(User01, Project01, segmentPair, CancellationToken.None)
            .Throws(new DataNotFoundException(string.Empty));

        // SUT
        ActionResult actual = await env.Controller.TrainSegmentAsync(Project01, segmentPair, CancellationToken.None);

        Assert.IsInstanceOf<NotFoundResult>(actual);
    }

    [Test]
    public async Task TrainSegmentAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var segmentPair = new SegmentPair();

        // SUT
        ActionResult actual = await env.Controller.TrainSegmentAsync(Project01, segmentPair, CancellationToken.None);

        Assert.IsInstanceOf<OkResult>(actual);
        await env
            .MachineApiService.Received(1)
            .TrainSegmentAsync(User01, Project01, segmentPair, CancellationToken.None);
    }

    [Test]
    public async Task TranslateAsync_MachineApiDown()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.MachineApiService.TranslateAsync(User01, Project01, string.Empty, CancellationToken.None)
            .Throws(new BrokenCircuitException());

        // SUT
        ActionResult<TranslationResult> actual = await env.Controller.TranslateAsync(
            Project01,
            string.Empty,
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
        ActionResult<TranslationResult> actual = await env.Controller.TranslateAsync(
            Project01,
            string.Empty,
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
        ActionResult<TranslationResult> actual = await env.Controller.TranslateAsync(
            Project01,
            string.Empty,
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
        ActionResult<TranslationResult> actual = await env.Controller.TranslateAsync(
            Project01,
            string.Empty,
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
        ActionResult<TranslationResult[]> actual = await env.Controller.TranslateNAsync(
            Project01,
            n,
            string.Empty,
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
        ActionResult<TranslationResult[]> actual = await env.Controller.TranslateNAsync(
            Project01,
            n,
            string.Empty,
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
        ActionResult<TranslationResult[]> actual = await env.Controller.TranslateNAsync(
            Project01,
            n,
            string.Empty,
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
        ActionResult<TranslationResult[]> actual = await env.Controller.TranslateNAsync(
            Project01,
            n,
            string.Empty,
            CancellationToken.None
        );

        Assert.IsInstanceOf<OkObjectResult>(actual.Result);
    }

    private class TestEnvironment
    {
        public TestEnvironment()
        {
            ExceptionHandler = Substitute.For<IExceptionHandler>();
            MachineApiService = Substitute.For<IMachineApiService>();
            UserAccessor = Substitute.For<IUserAccessor>();
            UserAccessor.UserId.Returns(User01);

            Controller = new MachineApiController(ExceptionHandler, MachineApiService, UserAccessor);
        }

        public MachineApiController Controller { get; }
        public IExceptionHandler ExceptionHandler { get; }
        public IMachineApiService MachineApiService { get; }
        public IUserAccessor UserAccessor { get; }
    }
}
