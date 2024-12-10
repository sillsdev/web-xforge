using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SIL.XForge.Models;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Controllers;

/// <summary>
/// Provides methods for uploading files.
/// </summary>
[Authorize]
[Route(UrlConstants.CommandApiNamespace + "/" + UrlConstants.SystemAdministration)]
public class SystemAdministrationController : ControllerBase
{
    private readonly ISystemAdministrationService _systemAdministrationService;
    private readonly IExceptionHandler _exceptionHandler;

    public SystemAdministrationController(
        ISystemAdministrationService systemAdministrationService,
        IExceptionHandler exceptionHandler
    )
    {
        _systemAdministrationService = systemAdministrationService;
        _exceptionHandler = exceptionHandler;
    }

    [HttpGet("getHelpVideos")]
    public IActionResult GetHelpVideos(string[] systemRoles)
    {
        try
        {
            return Ok(_systemAdministrationService.GetHelpVideos(systemRoles));
        }
        catch (ForbiddenException)
        {
            return Forbid();
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string> { { "method", "GetHelpVideos" } }
            );
            throw;
        }
    }

    [HttpPost("saveHelpVideo")]
    public async Task<IActionResult> SaveHelpVideo(HelpVideo helpVideo, string[] systemRoles)
    {
        try
        {
            return Ok(await _systemAdministrationService.SaveHelpVideoAsync(systemRoles, helpVideo));
        }
        catch (ForbiddenException)
        {
            return Forbid();
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string> { { "method", "SaveHelpVideo" } }
            );
            throw;
        }
    }
}
