using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Polly.CircuitBreaker;
using Serval.Client;
using SIL.Machine.WebApi;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Controllers;

/// <summary>
/// Provides methods for Machine Learning assisted translating.
/// </summary>
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

    /// <summary>
    /// Gets a build job.
    /// </summary>
    /// <param name="sfProjectId">The Scripture Forge project identifier.</param>
    /// <param name="buildId">The build identifier.</param>
    /// <param name="minRevision">The minimum revision.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <remarks>Omitting <paramref name="buildId"/> returns the current build running for the project.</remarks>
    /// <response code="200">The build is running.</response>
    /// <response code="204">No build is running.</response>
    /// <response code="403">You do not have permission to run a build for this project.</response>
    /// <response code="404">The project does not exist or is not configured on the ML server.</response>
    /// <response code="503">The ML server is temporarily unavailable or unresponsive.</response>
    [HttpGet(MachineApi.GetBuild)]
    public async Task<ActionResult<BuildDto?>> GetBuildAsync(
        string sfProjectId,
        string? buildId,
        [FromQuery] int? minRevision,
        CancellationToken cancellationToken
    )
    {
        try
        {
            BuildDto? build = string.IsNullOrWhiteSpace(buildId)
                ? await _machineApiService.GetCurrentBuildAsync(
                    _userAccessor.UserId,
                    sfProjectId,
                    minRevision,
                    cancellationToken
                )
                : await _machineApiService.GetBuildAsync(
                    _userAccessor.UserId,
                    sfProjectId,
                    buildId,
                    minRevision,
                    cancellationToken
                );

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

    /// <summary>
    /// Gets a translation engine.
    /// </summary>
    /// <param name="sfProjectId">The Scripture Forge project identifier.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <response code="200">The translation engine is configured for the project.</response>
    /// <response code="403">You do not have permission to retrieve the translation engine for this project.</response>
    /// <response code="404">The project does not exist or is not configured on the ML server.</response>
    /// <response code="503">The ML server is temporarily unavailable or unresponsive.</response>
    [HttpGet(MachineApi.GetEngine)]
    public async Task<ActionResult<EngineDto>> GetEngineAsync(string sfProjectId, CancellationToken cancellationToken)
    {
        try
        {
            EngineDto engine = await _machineApiService.GetEngineAsync(
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

    /// <summary>
    /// Gets the word graph that represents all possible translations of a segment of text.
    /// </summary>
    /// <param name="sfProjectId">The Scripture Forge project identifier.</param>
    /// <param name="segment">The source segment.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <response code="200">The word graph was successfully generated.</response>
    /// <response code="403">You do not have permission to retrieve the word graph for this project.</response>
    /// <response code="404">The project does not exist or is not configured on the ML server.</response>
    /// <response code="503">The ML server is temporarily unavailable or unresponsive.</response>
    [HttpPost(MachineApi.GetWordGraph)]
    public async Task<ActionResult<WordGraph>> GetWordGraphAsync(
        string sfProjectId,
        [FromBody] string segment,
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

    /// <summary>
    /// Starts a build job for a translation engine.
    /// </summary>
    /// <param name="sfProjectId">The Scripture Forge project identifier.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <response code="200">The build was successfully started.</response>
    /// <response code="403">You do not have permission to build this project.</response>
    /// <response code="404">The project does not exist or is not configured on the ML server.</response>
    /// <response code="503">The ML server is temporarily unavailable or unresponsive.</response>
    [HttpPost(MachineApi.StartBuild)]
    public async Task<ActionResult<BuildDto>> StartBuildAsync(
        [FromBody] string sfProjectId,
        CancellationToken cancellationToken
    )
    {
        try
        {
            BuildDto build = await _machineApiService.StartBuildAsync(
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

    /// <summary>
    /// Incrementally trains a translation engine with a segment pair.
    /// </summary>
    /// <param name="sfProjectId">The Scripture Forge project identifier.</param>
    /// <param name="segmentPair">The segment pair.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <response code="200">The segment was successfully trained.</response>
    /// <response code="403">You do not have permission to train a segment for this project.</response>
    /// <response code="404">The project does not exist or is not configured on the ML server.</response>
    /// <response code="503">The ML server is temporarily unavailable or unresponsive.</response>
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

    /// <summary>
    /// Translates a segment of text.
    /// </summary>
    /// <param name="sfProjectId">The Scripture Forge project identifier.</param>
    /// <param name="segment">The source segment.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <response code="200">The translation was successfully generated.</response>
    /// <response code="403">You do not have permission to translate a segment for this project.</response>
    /// <response code="404">The project does not exist or is not configured on the ML server.</response>
    /// <response code="503">The ML server is temporarily unavailable or unresponsive.</response>
    [HttpPost(MachineApi.Translate)]
    public async Task<ActionResult<TranslationResult>> TranslateAsync(
        string sfProjectId,
        [FromBody] string segment,
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

    /// <summary>
    /// Translates a segment of text into the top N results.
    /// </summary>
    /// <param name="sfProjectId">The Scripture Forge project identifier.</param>
    /// <param name="n">The number of translations.</param>
    /// <param name="segment">The source segment.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <response code="200">The translation was successfully generated.</response>
    /// <response code="403">You do not have permission to translate a segment for this project.</response>
    /// <response code="404">The project does not exist or is not configured on the ML server.</response>
    /// <response code="503">The ML server is temporarily unavailable or unresponsive.</response>
    [HttpPost(MachineApi.TranslateN)]
    public async Task<ActionResult<TranslationResult[]>> TranslateNAsync(
        string sfProjectId,
        int n,
        [FromBody] string segment,
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
