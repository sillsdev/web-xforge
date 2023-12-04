using System;
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
    /// Cancels the current pre-translation build.
    /// </summary>
    /// <param name="sfProjectId">The Scripture Forge project identifier.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <response code="200">The build was cancelled successfully.</response>
    /// <response code="403">You do not have permission to cancel the build.</response>
    /// <response code="404">The project does not exist or is not configured on the ML server.</response>
    /// <response code="405">The build cannot be cancelled.</response>
    /// <response code="503">The ML server is temporarily unavailable or unresponsive.</response>
    [HttpPost(MachineApi.CancelPreTranslationBuild)]
    public async Task<ActionResult> CancelPreTranslationBuildAsync(
        [FromBody] string sfProjectId,
        CancellationToken cancellationToken
    )
    {
        try
        {
            await _machineApiService.CancelPreTranslationBuildAsync(
                _userAccessor.UserId,
                sfProjectId,
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
        catch (NotSupportedException)
        {
            return new StatusCodeResult(405);
        }
        catch (ForbiddenException)
        {
            return Forbid();
        }
    }

    /// <summary>
    /// Gets a build job.
    /// </summary>
    /// <param name="sfProjectId">The Scripture Forge project identifier.</param>
    /// <param name="buildId">The build identifier.</param>
    /// <param name="minRevision">The minimum revision.</param>
    /// <param name="preTranslate"><c>true</c> if the build is a pre-translation build.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <remarks>Omitting <paramref name="buildId"/> returns the current build running for the project.</remarks>
    /// <response code="200">The build is running.</response>
    /// <response code="204">No build is running.</response>
    /// <response code="403">You do not have permission to run a build for this project.</response>
    /// <response code="404">The project does not exist or is not configured on the ML server.</response>
    /// <response code="503">The ML server is temporarily unavailable or unresponsive.</response>
    [HttpGet(MachineApi.GetBuild)]
    public async Task<ActionResult<ServalBuildDto?>> GetBuildAsync(
        string sfProjectId,
        string? buildId,
        [FromQuery] int? minRevision,
        [FromQuery] bool preTranslate,
        CancellationToken cancellationToken
    )
    {
        try
        {
            ServalBuildDto? build = null;
            if (preTranslate && buildId is null)
            {
                build = await _machineApiService.GetPreTranslationQueuedStateAsync(
                    _userAccessor.UserId,
                    sfProjectId,
                    cancellationToken
                );
            }

            // If a build identifier is not specified, get the current build
            build ??= string.IsNullOrWhiteSpace(buildId)
                ? await _machineApiService.GetCurrentBuildAsync(
                    _userAccessor.UserId,
                    sfProjectId,
                    minRevision,
                    preTranslate,
                    cancellationToken
                )
                : await _machineApiService.GetBuildAsync(
                    _userAccessor.UserId,
                    sfProjectId,
                    buildId,
                    minRevision,
                    preTranslate,
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
    /// Gets the last completed pre-translation build.
    /// </summary>
    /// <param name="sfProjectId">The Scripture Forge project identifier.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <response code="200">The last completed pre-translation build.</response>
    /// <response code="204">There is no completed pre-translation build.</response>
    /// <response code="403">You do not have permission to get the builds for this project.</response>
    /// <response code="404">The project does not exist or is not configured on the ML server.</response>
    /// <response code="503">The ML server is temporarily unavailable or unresponsive.</response>
    [HttpGet(MachineApi.GetLastCompletedPreTranslationBuild)]
    public async Task<ActionResult<ServalBuildDto?>> GetLastCompletedPreTranslationBuildAsync(
        string sfProjectId,
        CancellationToken cancellationToken
    )
    {
        try
        {
            ServalBuildDto? build = await _machineApiService.GetLastCompletedPreTranslationBuildAsync(
                _userAccessor.UserId,
                sfProjectId,
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
    /// Gets all of the pre-translations for the specified chapter.
    /// </summary>
    /// <param name="sfProjectId">The Scripture Forge project identifier.</param>
    /// <param name="bookNum">The book number.</param>
    /// <param name="chapterNum">The chapter number.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <remarks>
    /// If there are no pre-translations (because the build has not started, has not finished, or was cancelled),
    /// The <c>preTranslations</c> property in the return object will be an empty collection.
    /// </remarks>
    /// <response code="200">The pre-translations were successfully queried for.</response>
    /// <response code="403">You do not have permission to retrieve the pre-translations for this project.</response>
    /// <response code="404">The project does not exist or is not configured on the ML server.</response>
    /// <response code="503">The ML server is temporarily unavailable or unresponsive.</response>
    [HttpGet(MachineApi.GetPreTranslation)]
    public async Task<ActionResult<PreTranslationDto>> GetPreTranslationAsync(
        string sfProjectId,
        int bookNum,
        int chapterNum,
        CancellationToken cancellationToken
    )
    {
        try
        {
            PreTranslationDto preTranslation = await _machineApiService.GetPreTranslationAsync(
                _userAccessor.UserId,
                sfProjectId,
                bookNum,
                chapterNum,
                cancellationToken
            );
            return Ok(preTranslation);
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
    /// <response code="409">The engine has not been built on the ML server.</response>
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
        catch (InvalidOperationException)
        {
            return Conflict();
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
    public async Task<ActionResult> StartBuildAsync([FromBody] string sfProjectId, CancellationToken cancellationToken)
    {
        try
        {
            ServalBuildDto build = await _machineApiService.StartBuildAsync(
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
    /// Starts a pre-translation build job.
    /// </summary>
    /// <param name="buildConfig">The build configuration.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <response code="200">The pre-translation build was successfully started.</response>
    /// <response code="403">You do not have permission to build this project.</response>
    /// <response code="404">The project does not exist or is not configured on the ML server.</response>
    /// <response code="503">The ML server is temporarily unavailable or unresponsive.</response>
    /// <remarks>
    /// If a JSON string is passed in the format "project_id", then a default build configuration will be created for
    /// the project with the project id as the value of the string.
    /// </remarks>
    [HttpPost(MachineApi.StartPreTranslationBuild)]
    public async Task<ActionResult> StartPreTranslationBuildAsync(
        [FromBody] BuildConfig buildConfig,
        CancellationToken cancellationToken
    )
    {
        try
        {
            await _machineApiService.StartPreTranslationBuildAsync(
                _userAccessor.UserId,
                buildConfig,
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
