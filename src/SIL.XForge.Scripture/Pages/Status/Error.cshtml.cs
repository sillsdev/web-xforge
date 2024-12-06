using System.Reflection;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.Extensions.Localization;

namespace SIL.XForge.Scripture.Pages.Status;

public class ErrorModel(IStringLocalizerFactory localizerFactory) : PageModel
{
    public IStringLocalizer Localizer { get; } =
        localizerFactory.Create("Pages.NotFound", Assembly.GetExecutingAssembly().GetName().Name!);
    public int ErrorStatusCode { get; private set; }
    public bool RedirectToHome => ErrorStatusCode == 404;
    public string SiteOrigin => $"{Request.Scheme}://{Request.Host}";

    public void OnGet(int code) => ErrorStatusCode = code;
}
