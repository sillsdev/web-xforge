using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Polly.CircuitBreaker;
using Serval.Client;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Controllers;

[Route(MachineApi.Namespace)]
[ApiController]
[Authorize]
public class MachineApiController : ControllerBase
{
    private const string MachineApiUnavailable = "Machine API is unavailable";
    private readonly IExceptionHandler _exceptionHandler;
    private readonly IMachineApiService _machineApiService;
    private readonly IUserAccessor _userAccessor;

    public MachineApiController(
        IExceptionHandler exceptionHandler,
        IMachineApiService machineApiService,
        IUserAccessor userAccessor
    )
    {
        _machineApiService = machineApiService;
        _userAccessor = userAccessor;
        _exceptionHandler = exceptionHandler;
        _exceptionHandler.RecordUserIdForException(_userAccessor.UserId);
    }

    [HttpGet(MachineApi.GetBuild)]
    public async Task<ActionResult<TranslationBuild?>> GetBuildAsync(
        string sfProjectId,
        string? buildId,
        [FromQuery] int? minRevision,
        CancellationToken cancellationToken
    )
    {
        try
        {
            TranslationBuild? build;
            if (string.IsNullOrWhiteSpace(buildId))
            {
                build = await _machineApiService.GetCurrentBuildAsync(
                    _userAccessor.UserId,
                    sfProjectId,
                    minRevision,
                    cancellationToken
                );
            }
            else
            {
                build = await _machineApiService.GetBuildAsync(
                    _userAccessor.UserId,
                    sfProjectId,
                    buildId,
                    minRevision,
                    cancellationToken
                );
            }

            // A null means no build is running
            if (build is null)
            {
                return NoContent();
            }

            return Ok(build);
        }
        catch (BrokenCircuitException e)
        {
            _exceptionHandler.ReportException(e);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, MachineApiUnavailable);
        }
        catch (DataNotFoundException)
        {
            return NotFound();
        }
        catch (ForbiddenException)
        {
            return Forbid();
        }
    }

    [HttpGet(MachineApi.GetEngine)]
    public async Task<ActionResult<TranslationEngine>> GetEngineAsync(
        string sfProjectId,
        CancellationToken cancellationToken
    )
    {
        try
        {
            TranslationEngine engine = await _machineApiService.GetEngineAsync(
                _userAccessor.UserId,
                sfProjectId,
                cancellationToken
            );
            return Ok(engine);
        }
        catch (BrokenCircuitException e)
        {
            _exceptionHandler.ReportException(e);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, MachineApiUnavailable);
        }
        catch (DataNotFoundException)
        {
            return NotFound();
        }
        catch (ForbiddenException)
        {
            return Forbid();
        }
    }

    [HttpPost(MachineApi.GetWordGraph)]
    public async Task<ActionResult<WordGraph>> GetWordGraphAsync(
        string sfProjectId,
        [FromBody] string[] segment,
        CancellationToken cancellationToken
    )
    {
        try
        {
            WordGraph wordGraph = await _machineApiService.GetWordGraphAsync(
                _userAccessor.UserId,
                sfProjectId,
                segment,
                cancellationToken
            );
            return Ok(wordGraph);
        }
        catch (BrokenCircuitException e)
        {
            _exceptionHandler.ReportException(e);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, MachineApiUnavailable);
        }
        catch (DataNotFoundException)
        {
            return NotFound();
        }
        catch (ForbiddenException)
        {
            return Forbid();
        }
    }

    [HttpPost(MachineApi.StartBuild)]
    public async Task<ActionResult<TranslationBuild>> StartBuildAsync(
        [FromBody] string sfProjectId,
        CancellationToken cancellationToken
    )
    {
        try
        {
            TranslationBuild build = await _machineApiService.StartBuildAsync(
                _userAccessor.UserId,
                sfProjectId,
                cancellationToken
            );
            return Ok(build);
        }
        catch (BrokenCircuitException e)
        {
            _exceptionHandler.ReportException(e);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, MachineApiUnavailable);
        }
        catch (DataNotFoundException)
        {
            return NotFound();
        }
        catch (ForbiddenException)
        {
            return Forbid();
        }
    }

    [HttpPost(MachineApi.TrainSegment)]
    public async Task<ActionResult> TrainSegmentAsync(
        string sfProjectId,
        [FromBody] SegmentPair segmentPair,
        CancellationToken cancellationToken
    )
    {
        try
        {
            await _machineApiService.TrainSegmentAsync(
                _userAccessor.UserId,
                sfProjectId,
                segmentPair,
                cancellationToken
            );
            return Ok();
        }
        catch (BrokenCircuitException e)
        {
            _exceptionHandler.ReportException(e);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, MachineApiUnavailable);
        }
        catch (DataNotFoundException)
        {
            return NotFound();
        }
        catch (ForbiddenException)
        {
            return Forbid();
        }
    }

    [HttpPost(MachineApi.Translate)]
    public async Task<ActionResult<TranslationResult>> TranslateAsync(
        string sfProjectId,
        [FromBody] string[] segment,
        CancellationToken cancellationToken
    )
    {
        try
        {
            TranslationResult translationResult = await _machineApiService.TranslateAsync(
                _userAccessor.UserId,
                sfProjectId,
                segment,
                cancellationToken
            );
            return Ok(translationResult);
        }
        catch (BrokenCircuitException e)
        {
            _exceptionHandler.ReportException(e);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, MachineApiUnavailable);
        }
        catch (DataNotFoundException)
        {
            return NotFound();
        }
        catch (ForbiddenException)
        {
            return Forbid();
        }
    }

    [HttpPost(MachineApi.TranslateN)]
    public async Task<ActionResult<TranslationResult[]>> TranslateNAsync(
        string sfProjectId,
        int n,
        [FromBody] string[] segment,
        CancellationToken cancellationToken
    )
    {
        try
        {
            TranslationResult[] translationResults = await _machineApiService.TranslateNAsync(
                _userAccessor.UserId,
                sfProjectId,
                n,
                segment,
                cancellationToken
            );
            return Ok(translationResults);
        }
        catch (BrokenCircuitException e)
        {
            _exceptionHandler.ReportException(e);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, MachineApiUnavailable);
        }
        catch (DataNotFoundException)
        {
            return NotFound();
        }
        catch (ForbiddenException)
        {
            return Forbid();
        }
    }
}
