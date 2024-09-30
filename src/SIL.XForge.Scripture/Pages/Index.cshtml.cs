using System.Reflection;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Options;
using SIL.XForge.Configuration;

namespace SIL.XForge.Scripture.Pages;

public class IndexModel(IOptions<AuthOptions> authOptions, IStringLocalizerFactory localizerFactory) : PageModel
{
    public IStringLocalizer Localizer { get; } =
        localizerFactory.Create("Pages.Index", Assembly.GetExecutingAssembly().GetName().Name ?? string.Empty);

    public void OnGet()
    {
        ViewData["Domain"] = authOptions.Value.Domain;
        ViewData["ClientId"] = authOptions.Value.FrontendClientId;
        ViewData["Audience"] = authOptions.Value.Audience;
        ViewData["Scope"] = authOptions.Value.Scope;
    }
}
