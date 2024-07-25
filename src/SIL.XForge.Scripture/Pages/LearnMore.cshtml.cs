using System.Reflection;
using System.Web;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.Extensions.Localization;

namespace SIL.XForge.Scripture.Pages;

public class LearnMoreModel(IStringLocalizerFactory localizerFactory) : PageModel
{
    public IStringLocalizer Localizer { get; } =
        localizerFactory.Create("Pages.LearnMore", Assembly.GetExecutingAssembly().GetName().Name!);

    public void OnGet() => ViewData["Origin"] = HttpUtility.UrlEncode($"{Request.Scheme}://{Request.Host}");
}
