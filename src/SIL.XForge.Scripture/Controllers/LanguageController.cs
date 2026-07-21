using System;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Localization;
using Microsoft.AspNetCore.Mvc;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Controllers;

/// <summary>
/// Provides methods to allow users to configure their language and culture settings.
/// </summary>
[Route("language-api")]
[ApiController]
public class LanguageController(IExceptionHandler exceptionHandler, IUserAccessor userAccessor) : ControllerBase
{
    /// <summary>
    /// Set the user's language to the specified culture, then redirect.
    /// </summary>
    /// <param name="culture">The culture to change the culture to.</param>
    /// <param name="returnUrl">The URL to redirect to upon success.</param>
    /// <response code="200">The culture was updated successfully.</response>
    /// <response code="400">The culture or returnUrl parameters were empty.</response>
    [HttpPost]
    public IActionResult SetLanguage([FromForm] string culture, [FromForm] string returnUrl)
    {
        exceptionHandler.RecordUserIdForException(userAccessor.UserId);
        if (string.IsNullOrEmpty(culture))
            return BadRequest("culture cannot be empty");
        if (string.IsNullOrEmpty(returnUrl))
            return BadRequest("return url must be specified");

        var cookieName = CookieRequestCultureProvider.DefaultCookieName;
        var cookieValue = CookieRequestCultureProvider.MakeCookieValue(new RequestCulture(culture));
        Response.Cookies.Append(
            cookieName,
            cookieValue,
            new CookieOptions { Expires = DateTimeOffset.UtcNow.AddYears(1) }
        );

        return LocalRedirect(returnUrl);
    }
}
