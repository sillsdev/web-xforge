using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Controllers;

/// <summary>
/// Provides methods for uploading files.
/// </summary>
[Authorize]
[Route(UrlConstants.CommandApiNamespace + "/" + UrlConstants.Projects)]
public class SFProjectsUploadController : ControllerBase
{
    private readonly IExceptionHandler _exceptionHandler;
    private readonly IUserAccessor _userAccessor;
    private readonly ISFProjectService _projectService;

    public SFProjectsUploadController(
        IUserAccessor userAccessor,
        ISFProjectService projectService,
        IExceptionHandler exceptionHandler
    )
    {
        _userAccessor = userAccessor;
        _projectService = projectService;
        _exceptionHandler = exceptionHandler;
        _exceptionHandler.RecordUserIdForException(_userAccessor.UserId);
    }

    /// <summary>
    /// Uploads an audio file.
    /// </summary>
    /// <param name="projectId">The project identifier.</param>
    /// <param name="dataId">The data identifier.</param>
    /// <param name="file">The file contents.</param>
    /// <response code="200">The file was uploaded successfully.</response>
    /// <response code="400">The data or parameters were malformed.</response>
    /// <response code="403">Insufficient permission to upload a file to this project.</response>
    /// <response code="404">The project does not exist.</response>
    [HttpPost("audio")]
    [RequestSizeLimit(100_000_000)]
    public async Task<IActionResult> UploadAudioAsync(
        [FromForm] string projectId,
        [FromForm] string dataId,
        [FromForm] IFormFile? file
    )
    {
        try
        {
            // Ensure we have a file
            if (file is null)
            {
                return BadRequest();
            }

            await using Stream stream = file.OpenReadStream();
            Uri uri = await _projectService.SaveAudioAsync(
                _userAccessor.UserId,
                projectId,
                dataId,
                Path.GetExtension(file.FileName),
                stream
            );
            return Created(uri.PathAndQuery, Path.GetFileName(uri.AbsolutePath));
        }
        catch (ForbiddenException)
        {
            return Forbid();
        }
        catch (DataNotFoundException)
        {
            return NotFound();
        }
        catch (FormatException)
        {
            return BadRequest();
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "UploadAudioAsync" },
                    { "projectId", projectId },
                    { "dataId", dataId },
                }
            );
            throw;
        }
    }
}
