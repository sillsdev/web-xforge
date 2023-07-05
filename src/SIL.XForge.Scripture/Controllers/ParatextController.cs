using System;
using System.Collections.Generic;
using System.Linq;
using System.Security;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
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
    private readonly IExceptionHandler _exceptionHandler;
    private readonly IRepository<UserSecret> _userSecrets;
    private readonly IParatextService _paratextService;
    private readonly IUserAccessor _userAccessor;

    public ParatextController(
        IRepository<UserSecret> userSecrets,
        IParatextService paratextService,
        IUserAccessor userAccessor,
        IExceptionHandler exceptionHandler
    )
    {
        _userSecrets = userSecrets;
        _paratextService = paratextService;
        _userAccessor = userAccessor;
        _exceptionHandler = exceptionHandler;
        _exceptionHandler.RecordUserIdForException(_userAccessor.UserId);
    }

    /// <summary>
    /// Retrieves the Paratext projects the user has access to.
    /// </summary>
    /// <response code="200">The projects were successfully retrieved.</response>
    /// <response code="204">The user does not have permission to access Paratext.</response>
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
    }

    /// <summary>
    /// Retrieves a snapshot at a point in time for a text.
    /// </summary>
    /// <param name="projectId">The project id.</param>
    /// <param name="book">The three letter book code.</param>
    /// <param name="chapter">The chapter number.</param>
    /// <param name="timestamp">The point in time to get the snapshot at.</param>
    /// <response code="200">The snapshot was retrieved for the specified point in time.</response>
    /// <response code="403">The user does not have permission to access the document.</response>
    /// <response code="404">The document does not exist.</response>
    [HttpGet("history/texts/{projectId}_{book}_{chapter:int}_target")]
    public async Task<ActionResult<Snapshot<TextData>>> GetHistoryAsync(
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
            return Ok(await _paratextService.GetHistoryAsync(userSecret, projectId, book, chapter, timestamp));
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
    /// values are an array with the short name followed by the name.
    /// </response>
    /// <response code="204">The user does not have permission to access Paratext.</response>
    [HttpGet("resources")]
    public async Task<ActionResult<Dictionary<string, string[]>>> ResourcesAsync()
    {
        try
        {
            var resources = await _paratextService.GetResourcesAsync(_userAccessor.UserId);
            return Ok(resources.ToDictionary(r => r.ParatextId, r => new string[] { r.ShortName, r.Name }));
        }
        catch (DataNotFoundException)
        {
            return NoContent();
        }
        catch (SecurityException)
        {
            return NoContent();
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
