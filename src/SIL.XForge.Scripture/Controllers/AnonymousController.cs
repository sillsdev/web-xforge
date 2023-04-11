using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Controllers;

[Route(UrlConstants.Anonymous)]
[ApiController]
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

    [HttpPost]
    public async Task<IActionResult> CheckShareKey([FromBody] CheckShareKeyRequest content)
    {
        try
        {
            return Ok(await _anonymousService.CheckShareKey(content.ShareKey));
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
                new Dictionary<string, string> { { "method", "CheckShareKey" }, { "shareKey", content.ShareKey } }
            );
            throw;
        }
    }

    [HttpPost]
    public async Task<IActionResult> GenerateAccount([FromBody] GenerateAccountRequest request)
    {
        try
        {
            var credentials = await _anonymousService.GenerateAccount(
                request.ShareKey,
                request.DisplayName,
                request.Language
            );
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
                new Dictionary<string, string>
                {
                    { "method", "GenerateAccount" },
                    { "shareKey", request.ShareKey },
                    { "displayName", request.DisplayName },
                    { "language", request.Language }
                }
            );
            throw;
        }
    }
}
