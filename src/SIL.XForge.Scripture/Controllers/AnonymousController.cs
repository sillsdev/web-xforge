using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Controllers;

[Route(UrlConstants.Anonymous)]
[AllowAnonymous]
public class AnonymousController : ControllerBase
{
    private readonly IAnonymousService _anonymousService;
    private readonly IExceptionHandler _exceptionHandler;

    public AnonymousController(IAnonymousService anonymousService, IExceptionHandler exceptionHandler)
    {
        _anonymousService = anonymousService;
        _exceptionHandler = exceptionHandler;
    }

    [HttpPost("checkShareKey")]
    public async Task<IActionResult> CheckSharingKey([FromForm] string shareKey)
    {
        try
        {
            return Ok(await _anonymousService.CheckSharingKey(shareKey));
        }
        catch (DataNotFoundException e)
        {
            return NotFound(e.Message);
        }
        catch (ForbiddenException e)
        {
            return NotFound(e.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string> { { "method", "CheckSharingKey" }, { "shareKey", shareKey } }
            );
            throw;
        }
    }

    [HttpPost("generateAccount")]
    public async Task<IActionResult> GenerateAccount(
        [FromForm] string shareKey,
        [FromForm] string displayName,
        [FromForm] string language
    )
    {
        try
        {
            var credentials = await _anonymousService.GenerateAccount(shareKey, displayName, language);
            // Store credentials in a cookie as a fallback to the auth0 tokens expiring so the user can log in again
            Response.Cookies.Append(
                CookieConstants.TransparentAuthentication,
                Newtonsoft.Json.JsonConvert.SerializeObject(credentials),
                new CookieOptions { Expires = DateTimeOffset.UtcNow.AddYears(2) }
            );
            return Ok(true);
        }
        catch (ForbiddenException e)
        {
            return NotFound(e.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string> { { "method", "CheckSharingKey" }, { "shareKey", shareKey } }
            );
            throw;
        }
    }
}
