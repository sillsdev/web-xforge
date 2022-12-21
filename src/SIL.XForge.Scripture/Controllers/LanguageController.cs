using System;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Localization;
using Microsoft.AspNetCore.Mvc;

namespace SIL.XForge.Scripture.Controllers;

[Route("language-api")]
[ApiController]
public class LanguageController : ControllerBase
{
    [HttpPost]
    public IActionResult SetLanguage([FromForm] string culture, [FromForm] string returnUrl)
    {
        if (string.IsNullOrEmpty(culture))
            throw new ArgumentException("culture cannot be empty", culture);
        if (string.IsNullOrEmpty(returnUrl))
            throw new ArgumentException("return url must be specified", returnUrl);

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
