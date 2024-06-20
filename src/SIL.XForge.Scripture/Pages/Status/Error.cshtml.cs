using System.Reflection;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.Extensions.Localization;

namespace SIL.XForge.Scripture.Pages;

public class ErrorModel(IStringLocalizerFactory localizerFactory) : PageModel
{
    public IStringLocalizer Localizer { get; } =
        localizerFactory.Create("Pages.NotFound", Assembly.GetExecutingAssembly().GetName().Name!);
    public int ErrorStatusCode { get; set; }
    public bool RedirectToHome { get; set; }

    public void OnGet(int code)
    {
        ViewData["Origin"] = $"{Request.Scheme}://{Request.Host}";
        ErrorStatusCode = code;
        RedirectToHome = ErrorStatusCode == 404;
    }
}
