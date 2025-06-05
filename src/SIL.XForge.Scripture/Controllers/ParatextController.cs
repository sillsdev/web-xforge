using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Paratext.Data;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Controllers;

/// <summary>
/// Provides methods for retrieving data from Paratext.
/// </summary>
[Route("paratext-api")]
[ApiController]
[Authorize]
public class ParatextController : ControllerBase
{
    private const string ParatextUnavailable = "Could not connect to Paratext";

    private readonly IExceptionHandler _exceptionHandler;
    private readonly IMachineProjectService _machineProjectService;
    private readonly IParatextService _paratextService;
    private readonly ISFProjectService _projectService;
    private readonly IUserAccessor _userAccessor;
    private readonly IRepository<UserSecret> _userSecrets;

    public ParatextController(
        IExceptionHandler exceptionHandler,
        IMachineProjectService machineProjectService,
        IParatextService paratextService,
        ISFProjectService projectService,
        IUserAccessor userAccessor,
        IRepository<UserSecret> userSecrets
    )
    {
        _userSecrets = userSecrets;
        _machineProjectService = machineProjectService;
        _paratextService = paratextService;
        _projectService = projectService;
        _userAccessor = userAccessor;
        _exceptionHandler = exceptionHandler;
        _exceptionHandler.RecordUserIdForException(_userAccessor.UserId);
    }

    /// <summary>
    /// Download a project or resource as a Paratext zip file.
    /// </summary>
    /// <param name="projectId">The Scripture Forge project identifier.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <returns>The zip data for the project, if present in Scripture Forge.</returns>
    /// <response code="200">The zip file was successfully downloaded.</response>
    /// <response code="403">The user is not a system administrator or serval administrator.</response>
    /// <response code="404">The project does not exist, or could not be found on disk.</response>
    [HttpGet("projects/{projectId}/download")]
    [ProducesResponseType(typeof(FileStreamResult), 200)]
    public async Task<ActionResult> DownloadProjectAsync(string projectId, CancellationToken cancellationToken)
    {
        // Only a system administrator or serval administrator can download a project
        if (
            !(
                _userAccessor.SystemRoles.Contains(SystemRole.ServalAdmin)
                || _userAccessor.SystemRoles.Contains(SystemRole.SystemAdmin)
            )
        )
        {
            return Forbid();
        }

        string fileName;
        MemoryStream outputStream = new MemoryStream();
        try
        {
            fileName = await _machineProjectService.GetProjectZipAsync(projectId, outputStream, cancellationToken);
        }
        catch (DataNotFoundException e)
        {
            return NotFound(e.Message);
        }

        // Reset the stream to the start
        outputStream.Seek(0, SeekOrigin.Begin);

        // Return the zip file stream
        return File(outputStream, "application/zip", fileName);
    }

    /// <summary>
    /// Joins a user to an existing project already configured in Scripture Forge.
    /// </summary>
    /// <param name="projectId">The Scripture Forge project identifier.</param>
    /// <returns>An HTTP Response code corresponding to the action's success.</returns>
    /// <response code="200">The user has joined to the project successfully.</response>
    /// <response code="403">The user does not have permission to join this project.</response>
    /// <response code="404">The project has not been connected to on Scripture Forge before.</response>
    [HttpPost("projects/{projectId}/join")]
    public async Task<ActionResult> JoinProjectAsync(string projectId)
    {
        try
        {
            await _projectService.AddUserAsync(_userAccessor.UserId, projectId, projectRole: null);
            return Ok();
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
    /// Retrieves the Paratext projects the user has access to.
    /// </summary>
    /// <response code="200">The projects were successfully retrieved.</response>
    /// <response code="204">The user does not have permission to access Paratext.</response>
    /// <response code="401">The user's Paratext tokens have expired, and the user must log in again.</response>
    /// <response code="503">The Paratext registry is unavailable.</response>
    [HttpGet("projects")]
    public async Task<ActionResult<IEnumerable<ParatextProject>>> GetAsync()
    {
        Attempt<UserSecret> attempt = await _userSecrets.TryGetAsync(_userAccessor.UserId);
        if (!attempt.TryResult(out UserSecret userSecret))
            return NoContent();
        try
        {
            IReadOnlyList<ParatextProject> projects = await _paratextService.GetProjectsAsync(userSecret);
            return Ok(projects);
        }
        catch (SecurityException)
        {
            return NoContent();
        }
        catch (UnauthorizedAccessException)
        {
            return Unauthorized();
        }
        catch (CannotConnectException)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, ParatextUnavailable);
        }
    }

    /// <summary>
    /// Retrieves a snapshot at a point in time for a text.
    /// </summary>
    /// <param name="projectId">The project id.</param>
    /// <param name="book">The three letter book code.</param>
    /// <param name="chapter">The chapter number.</param>
    /// <param name="timestamp">The point in time to get the snapshot at, in UTC.</param>
    /// <response code="200">The snapshot was retrieved for the specified point in time.</response>
    /// <response code="403">The user does not have permission to access the document.</response>
    /// <response code="404">The document does not exist.</response>
    [HttpGet("history/snapshot/{projectId}_{book}_{chapter:int}_target")]
    public async Task<ActionResult<TextSnapshot>> GetSnapshotAsync(
        string projectId,
        string book,
        int chapter,
        DateTime timestamp
    )
    {
        Attempt<UserSecret> attempt = await _userSecrets.TryGetAsync(_userAccessor.UserId);
        if (!attempt.TryResult(out UserSecret userSecret))
        {
            return Forbid();
        }

        try
        {
            return Ok(await _paratextService.GetSnapshotAsync(userSecret, projectId, book, chapter, timestamp));
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
    /// Retrieves the revision history as a series of points in time with a description.
    /// </summary>
    /// <param name="projectId">The project id.</param>
    /// <param name="book">The three letter book code.</param>
    /// <param name="chapter">The chapter number.</param>
    /// <remarks>
    /// The timestamps returned from this can be used to guide the user towards history selection.
    /// </remarks>
    /// <returns>
    /// The timestamps for the revisions in UTC, with a brief summary text.
    /// </returns>
    /// <response code="200">The revision history was retrieved successfully.</response>
    /// <response code="403">The user does not have permission to access the document.</response>
    /// <response code="404">The document does not exist.</response>
    [HttpGet("history/revisions/{projectId}_{book}_{chapter:int}_target")]
    public async Task<ActionResult<IAsyncEnumerable<DocumentRevision>>> GetRevisionHistoryAsync(
        string projectId,
        string book,
        int chapter
    )
    {
        Attempt<UserSecret> attempt = await _userSecrets.TryGetAsync(_userAccessor.UserId);
        if (!attempt.TryResult(out UserSecret userSecret))
        {
            return Forbid();
        }

        try
        {
            return Ok(_paratextService.GetRevisionHistoryAsync(userSecret, projectId, book, chapter));
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
    /// Retrieves the Paratext resources the user has access to.
    /// </summary>
    /// <response code="200">
    /// The resources were successfully retrieved. A dictionary is returned where the Paratext Id is the key, and the
    /// values are an array containing: [shortName, name, languageTag].
    /// </response>
    /// <response code="204">The user does not have permission to access Paratext.</response>
    /// <response code="401">The user's Paratext tokens have expired, and the user must log in again.</response>
    /// <response code="503">The Paratext registry is unavailable.</response>
    [HttpGet("resources")]
    public async Task<ActionResult<Dictionary<string, string[]>>> ResourcesAsync()
    {
        try
        {
            var resources = await _paratextService.GetResourcesAsync(_userAccessor.UserId);
            return Ok(
                resources.ToDictionary(r => r.ParatextId, r => new string[] { r.ShortName, r.Name, r.LanguageTag })
            );
        }
        catch (DataNotFoundException)
        {
            return NoContent();
        }
        catch (SecurityException)
        {
            return NoContent();
        }
        catch (UnauthorizedAccessException)
        {
            return Unauthorized();
        }
        catch (CannotConnectException)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, ParatextUnavailable);
        }
    }

    /// <summary>
    /// Joins a user to an existing project already configured in Scripture Forge.
    /// </summary>
    /// <param name="projectId">The Paratext project identifier or the Scripture Forge project identifier.</param>
    /// <returns>The Scripture Forge project identifier.</returns>
    /// <response code="200">The user has joined to the project successfully.</response>
    /// <response code="401">The user does not have permission to access the Paratext Registry or Archives.</response>
    /// <response code="403">The user does not have permission to join this project.</response>
    /// <response code="404">The user or project could not be found.</response>
    /// <response code="404">The project cannot be connected to, or synced. Log a support ticket.</response>
    [HttpPost("projects")]
    public async Task<ActionResult<string>> SyncAsync([FromBody] string projectId)
    {
        try
        {
            return Ok(await _projectService.ConnectOrSyncAsync(_userAccessor.UserId, projectId));
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
        catch (UnauthorizedAccessException)
        {
            return Unauthorized();
        }
    }

    /// <summary>
    /// Retrieves the Paratext username for the currently logged in user.
    /// </summary>
    /// <response code="200">The logged in user has access to Paratext.</response>
    /// <response code="204">The user does not have permission to access Paratext.</response>
    [HttpGet("username")]
    public async Task<ActionResult<string>> UsernameAsync()
    {
        Attempt<UserSecret> attempt = await _userSecrets.TryGetAsync(_userAccessor.UserId);
        if (!attempt.TryResult(out UserSecret userSecret))
            return NoContent();
        string username = _paratextService.GetParatextUsername(userSecret);
        return Ok(username);
    }
}
