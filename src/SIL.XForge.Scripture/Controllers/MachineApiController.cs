using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Polly.CircuitBreaker;
using Serval.Client;
using SIL.Converters.Usj;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
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
            return new StatusCodeResult(StatusCodes.Status405MethodNotAllowed);
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
            // First, check for a queued build
            ServalBuildDto? build = null;
            bool isServalAdmin = _userAccessor.SystemRoles.Contains(SystemRole.ServalAdmin);
            if (buildId is null)
            {
                build = await _machineApiService.GetQueuedStateAsync(
                    _userAccessor.UserId,
                    sfProjectId,
                    preTranslate,
                    isServalAdmin,
                    cancellationToken
                );

                // If a build is still being uploaded, we need to wait for Serval to report the first revision
                if (build?.State == MachineApiService.BuildStateQueued && minRevision > 0)
                {
                    build = null;
                }
            }

            // If a build identifier is not specified, get the current build
            build ??= string.IsNullOrWhiteSpace(buildId)
                ? await _machineApiService.GetCurrentBuildAsync(
                    _userAccessor.UserId,
                    sfProjectId,
                    minRevision,
                    preTranslate,
                    isServalAdmin,
                    cancellationToken
                )
                : await _machineApiService.GetBuildAsync(
                    _userAccessor.UserId,
                    sfProjectId,
                    buildId,
                    minRevision,
                    preTranslate,
                    isServalAdmin,
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
    /// Gets the previous and current builds for a project.
    /// </summary>
    /// <param name="sfProjectId">The Scripture Forge project identifier.</param>
    /// <param name="preTranslate"><c>true</c> if the builds are pre-translation builds.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <response code="200">The builds are returned.</response>
    /// <response code="403">You do not have permission to retrieve builds for this project.</response>
    /// <response code="404">The project does not exist or is not configured on the ML server.</response>
    /// <response code="503">The ML server is temporarily unavailable or unresponsive.</response>
    [HttpGet(MachineApi.GetBuilds)]
    public ActionResult<IAsyncEnumerable<ServalBuildDto>> GetBuildsAsync(
        string sfProjectId,
        [FromQuery] bool preTranslate,
        CancellationToken cancellationToken
    )
    {
        try
        {
            bool isServalAdmin = _userAccessor.SystemRoles.Contains(SystemRole.ServalAdmin);
            return Ok(
                _machineApiService.GetBuildsAsync(
                    _userAccessor.UserId,
                    sfProjectId,
                    preTranslate,
                    isServalAdmin,
                    cancellationToken
                )
            );
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
    public async Task<ActionResult<ServalEngineDto>> GetEngineAsync(
        string sfProjectId,
        CancellationToken cancellationToken
    )
    {
        try
        {
            ServalEngineDto engine = await _machineApiService.GetEngineAsync(
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
            bool isServalAdmin = _userAccessor.SystemRoles.Contains(SystemRole.ServalAdmin);
            ServalBuildDto? build = await _machineApiService.GetLastCompletedPreTranslationBuildAsync(
                _userAccessor.UserId,
                sfProjectId,
                isServalAdmin,
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
    /// Gets all the pre-translations for the specified chapter.
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
    /// <response code="409">The engine has not been built on the ML server.</response>
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
        catch (InvalidOperationException)
        {
            return Conflict();
        }
    }

    /// <summary>
    /// Gets the pre-translations for the specified chapter as a delta.
    /// </summary>
    /// <param name="sfProjectId">The Scripture Forge project identifier.</param>
    /// <param name="bookNum">The book number.</param>
    /// <param name="chapterNum">The chapter number. This cannot be zero.</param>
    /// <param name="timestamp">The timestamp to return the pre-translations at. If not set, this is the current date and time.</param>
    /// <param name="preserveParagraphs">If <c>true</c>, configure the draft delta to preserve paragraph markers.</param>
    /// <param name="preserveStyles">If <c>true</c>, configure the draft delta to preserve style markers.</param>
    /// <param name="preserveEmbeds">If <c>true</c>, configure the draft delta to preserve embed markers.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <response code="200">The pre-translations were successfully queried for.</response>
    /// <response code="403">You do not have permission to retrieve the pre-translations for this project.</response>
    /// <response code="404">The project does not exist or is not configured on the ML server.</response>
    /// <response code="405">Retrieving the pre-translations in this format is not supported.</response>
    /// <response code="409">The engine has not been built on the ML server.</response>
    /// <response code="503">The ML server is temporarily unavailable or unresponsive.</response>
    [HttpGet(MachineApi.GetPreTranslationDelta)]
    public async Task<ActionResult<Snapshot<TextData>>> GetPreTranslationDeltaAsync(
        string sfProjectId,
        int bookNum,
        int chapterNum,
        [FromQuery] DateTime? timestamp,
        [FromQuery] bool? preserveParagraphs,
        [FromQuery] bool? preserveStyles,
        [FromQuery] bool? preserveEmbeds,
        CancellationToken cancellationToken
    )
    {
        try
        {
            bool isServalAdmin = _userAccessor.SystemRoles.Contains(SystemRole.ServalAdmin);
            DraftUsfmConfig? config = null;
            if (preserveParagraphs != null || preserveStyles != null || preserveEmbeds != null)
            {
                config = new DraftUsfmConfig
                {
                    PreserveParagraphMarkers = preserveParagraphs ?? true,
                    PreserveStyleMarkers = preserveStyles ?? false,
                    PreserveEmbedMarkers = preserveEmbeds ?? true,
                };
            }
            Snapshot<TextData> delta = await _machineApiService.GetPreTranslationDeltaAsync(
                _userAccessor.UserId,
                sfProjectId,
                bookNum,
                chapterNum,
                isServalAdmin,
                timestamp ?? DateTime.UtcNow,
                config,
                cancellationToken
            );
            return Ok(delta);
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
        catch (NotSupportedException)
        {
            return new StatusCodeResult(StatusCodes.Status405MethodNotAllowed);
        }
    }

    /// <summary>
    /// Retrieves the pre-translation draft revisions present for the specified book and chapter.
    /// </summary>
    /// <param name="sfProjectId">The Scripture Forge project identifier.</param>
    /// <param name="bookNum">The book number.</param>
    /// <param name="chapterNum">The chapter number.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <remarks>
    /// The timestamps returned from this can be used to guide the user towards history selection.
    /// </remarks>
    /// <returns>
    /// The timestamps for the revisions in UTC, with the source of the draft.
    /// </returns>
    /// <response code="200">The draft history was retrieved successfully.</response>
    /// <response code="403">The user does not have permission to access the draft.</response>
    /// <response code="404">The draft does not exist.</response>
    [HttpGet(MachineApi.GetPreTranslationHistory)]
    public ActionResult<IAsyncEnumerable<DocumentRevision>> GetPreTranslationRevisionsAsync(
        string sfProjectId,
        int bookNum,
        int chapterNum,
        CancellationToken cancellationToken
    )
    {
        try
        {
            bool isServalAdmin = _userAccessor.SystemRoles.Contains(SystemRole.ServalAdmin);
            return Ok(
                _machineApiService.GetPreTranslationRevisionsAsync(
                    _userAccessor.UserId,
                    sfProjectId,
                    bookNum,
                    chapterNum,
                    isServalAdmin,
                    cancellationToken
                )
            );
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
    /// Gets the pre-translations for the specified chapter as USFM.
    /// </summary>
    /// <remarks>This method can be called by Serval Administrators for any project.</remarks>
    /// <param name="sfProjectId">The Scripture Forge project identifier.</param>
    /// <param name="bookNum">The book number.</param>
    /// <param name="chapterNum">The chapter number. If zero, the entire book is returned.</param>
    /// <param name="timestamp">The timestamp to return the pre-translations at. If not set, this is the current date and time.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <remarks>If the <paramref name="chapterNum"/> is zero, <paramref name="timestamp"/> will be ignored.</remarks>
    /// <response code="200">The pre-translations were successfully queried for.</response>
    /// <response code="403">You do not have permission to retrieve the pre-translations for this project.</response>
    /// <response code="404">The project does not exist or is not configured on the ML server.</response>
    /// <response code="405">Retrieving the pre-translations in this format is not supported.</response>
    /// <response code="409">The engine has not been built on the ML server.</response>
    /// <response code="503">The ML server is temporarily unavailable or unresponsive.</response>
    [HttpGet(MachineApi.GetPreTranslationUsfm)]
    public async Task<ActionResult<string>> GetPreTranslationUsfmAsync(
        string sfProjectId,
        int bookNum,
        int chapterNum,
        DateTime? timestamp,
        CancellationToken cancellationToken
    )
    {
        try
        {
            bool isServalAdmin = _userAccessor.SystemRoles.Contains(SystemRole.ServalAdmin);
            string usfm = await _machineApiService.GetPreTranslationUsfmAsync(
                _userAccessor.UserId,
                sfProjectId,
                bookNum,
                chapterNum,
                isServalAdmin,
                timestamp ?? DateTime.UtcNow,
                null,
                cancellationToken
            );
            return Ok(usfm);
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
        catch (NotSupportedException)
        {
            return new StatusCodeResult(StatusCodes.Status405MethodNotAllowed);
        }
    }

    /// <summary>
    /// Gets the pre-translations for the specified chapter as USJ.
    /// </summary>
    /// <param name="sfProjectId">The Scripture Forge project identifier.</param>
    /// <param name="bookNum">The book number.</param>
    /// <param name="chapterNum">The chapter number. If zero, the entire book is returned.</param>
    /// <param name="timestamp">The timestamp to return the pre-translations at. If not set, this is the current date and time.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <remarks>If the <paramref name="chapterNum"/> is zero, <paramref name="timestamp"/> will be ignored.</remarks>
    /// <response code="200">The pre-translations were successfully queried for.</response>
    /// <response code="403">You do not have permission to retrieve the pre-translations for this project.</response>
    /// <response code="404">The project does not exist or is not configured on the ML server.</response>
    /// <response code="405">Retrieving the pre-translations in this format is not supported.</response>
    /// <response code="409">The engine has not been built on the ML server.</response>
    /// <response code="503">The ML server is temporarily unavailable or unresponsive.</response>
    [HttpGet(MachineApi.GetPreTranslationUsj)]
    public async Task<ActionResult<Usj>> GetPreTranslationUsjAsync(
        string sfProjectId,
        int bookNum,
        int chapterNum,
        DateTime? timestamp,
        CancellationToken cancellationToken
    )
    {
        try
        {
            bool isServalAdmin = _userAccessor.SystemRoles.Contains(SystemRole.ServalAdmin);
            IUsj usj = await _machineApiService.GetPreTranslationUsjAsync(
                _userAccessor.UserId,
                sfProjectId,
                bookNum,
                chapterNum,
                isServalAdmin,
                timestamp ?? DateTime.UtcNow,
                null,
                cancellationToken
            );
            return Ok(usj);
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
        catch (NotSupportedException)
        {
            return new StatusCodeResult(StatusCodes.Status405MethodNotAllowed);
        }
    }

    /// <summary>
    /// Gets the pre-translations for the specified chapter as USX.
    /// </summary>
    /// <param name="sfProjectId">The Scripture Forge project identifier.</param>
    /// <param name="bookNum">The book number.</param>
    /// <param name="chapterNum">The chapter number. If zero, the entire book is returned.</param>
    /// <param name="timestamp">The timestamp to return the pre-translations at. If not set, this is the current date and time.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <remarks>If the <paramref name="chapterNum"/> is zero, <paramref name="timestamp"/> will be ignored.</remarks>
    /// <response code="200">The pre-translations were successfully queried for.</response>
    /// <response code="403">You do not have permission to retrieve the pre-translations for this project.</response>
    /// <response code="404">The project does not exist or is not configured on the ML server.</response>
    /// <response code="405">Retrieving the pre-translations in this format is not supported.</response>
    /// <response code="409">The engine has not been built on the ML server.</response>
    /// <response code="503">The ML server is temporarily unavailable or unresponsive.</response>
    [HttpGet(MachineApi.GetPreTranslationUsx)]
    public async Task<ActionResult<string>> GetPreTranslationUsxAsync(
        string sfProjectId,
        int bookNum,
        int chapterNum,
        DateTime? timestamp,
        CancellationToken cancellationToken
    )
    {
        try
        {
            bool isServalAdmin = _userAccessor.SystemRoles.Contains(SystemRole.ServalAdmin);
            string usx = await _machineApiService.GetPreTranslationUsxAsync(
                _userAccessor.UserId,
                sfProjectId,
                bookNum,
                chapterNum,
                isServalAdmin,
                timestamp ?? DateTime.UtcNow,
                null,
                cancellationToken
            );
            return Ok(usx);
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
        catch (NotSupportedException)
        {
            return new StatusCodeResult(StatusCodes.Status405MethodNotAllowed);
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
    /// Retrieves information on whether a language is supported by Serval.
    /// </summary>
    /// <param name="languageCode">The language code.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <response code="200">The language information was successfully retrieved.</response>
    /// <response code="503">The ML server is temporarily unavailable or unresponsive.</response>
    [HttpGet(MachineApi.IsLanguageSupported)]
    public async Task<ActionResult<LanguageDto>> IsLanguageSupportedAsync(
        string languageCode,
        CancellationToken cancellationToken
    )
    {
        try
        {
            LanguageDto language = await _machineApiService.IsLanguageSupportedAsync(languageCode, cancellationToken);
            return Ok(language);
        }
        catch (BrokenCircuitException e)
        {
            _exceptionHandler.ReportException(e);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, MachineApiUnavailable);
        }
    }

    /// <summary>
    /// Starts a build job for a translation engine.
    /// </summary>
    /// <param name="sfProjectId">The Scripture Forge project identifier.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <response code="200">The build was successfully started.</response>
    /// <response code="401">Your Paratext tokens have expired, and you must log in again.</response>
    /// <response code="403">You do not have permission to build this project.</response>
    /// <response code="404">The project does not exist or is not configured on the ML server.</response>
    /// <response code="503">The ML server is temporarily unavailable or unresponsive.</response>
    [HttpPost(MachineApi.StartBuild)]
    public async Task<ActionResult> StartBuildAsync([FromBody] string sfProjectId, CancellationToken cancellationToken)
    {
        try
        {
            await _machineApiService.StartBuildAsync(_userAccessor.UserId, sfProjectId, cancellationToken);
            ServalBuildDto? build = await _machineApiService.GetQueuedStateAsync(
                _userAccessor.UserId,
                sfProjectId,
                preTranslate: false,
                isServalAdmin: false,
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
        catch (UnauthorizedAccessException)
        {
            return Unauthorized();
        }
    }

    /// <summary>
    /// Starts a pre-translation build job.
    /// </summary>
    /// <param name="buildConfig">The build configuration.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <response code="200">The pre-translation build was successfully started.</response>
    /// <response code="401">Your Paratext tokens have expired, and you must log in again.</response>
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
        catch (UnauthorizedAccessException)
        {
            return Unauthorized();
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
