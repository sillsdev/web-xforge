using System.Reflection;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.Extensions.Localization;

namespace SIL.XForge.Scripture.Pages.Status;

/// <summary>
/// Provides a page for displaying error messages.
/// </summary>
/// <param name="localizerFactory">The localizer factory.</param>
/// <remarks>
/// To prevent 400 errors when APIs return errors during a POST, this page does not require an anti-forgery token.
/// This is because this page is called via UseStatusCodePagesWithReExecute() from Startup.cs.
/// </remarks>
[IgnoreAntiforgeryToken]
public class ErrorModel(IStringLocalizerFactory localizerFactory) : PageModel
{
    public IStringLocalizer Localizer { get; } =
        localizerFactory.Create("Pages.NotFound", Assembly.GetExecutingAssembly().GetName().Name!);
    public int ErrorStatusCode { get; private set; }
    public bool RedirectToHome => ErrorStatusCode == 404;
    public string SiteOrigin => $"{Request.Scheme}://{Request.Host}";

    public void OnGet(int code) => ErrorStatusCode = code;
}
