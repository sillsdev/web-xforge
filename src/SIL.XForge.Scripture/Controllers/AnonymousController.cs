using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Security;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Controllers;

/// <summary>
/// Provides methods for authentication of anonymous users.
/// </summary>
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

    /// <summary>
    /// Checks whether or not the share key is valid.
    /// </summary>
    /// <param name="content">The share key to check.</param>
    /// <response code="200">The share key is valid.</response>
    /// <response code="404">The share key is invalid or not found.</response>
    [HttpPost("checkShareKey")]
    public async Task<ActionResult<AnonymousShareKeyResponse>> CheckShareKey([FromBody] CheckShareKeyRequest content)
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

    /// <summary>
    /// Generates an anonymous account.
    /// </summary>
    /// <param name="request">The parameters to generate the account.</param>
    /// <response code="200">The account was generated.</response>
    /// <response code="204">There was a problem communicating with the authentication server.</response>
    /// <response code="404">The share key does not exist.</response>
    [HttpPost("generateAccount")]
    public async Task<ActionResult<bool>> GenerateAccount([FromBody] GenerateAccountRequest request)
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
        catch (DataNotFoundException e)
        {
            return NotFound(e.Message);
        }
        catch (HttpRequestException e)
        {
            _exceptionHandler.ReportException(e);
            return NoContent();
        }
        catch (TaskCanceledException e)
        {
            _exceptionHandler.ReportException(e);
            return NoContent();
        }
        catch (SecurityException e)
        {
            _exceptionHandler.ReportException(e);
            return NoContent();
        }
        catch (Exception)
        {
            throw;
        }
    }
}
