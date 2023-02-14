using System.Reflection;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Options;
using SIL.XForge.Configuration;

namespace SIL.XForge.Scripture.Pages;

public class IndexModel : PageModel
{
    public IStringLocalizer Localizer { get; }

    private readonly IOptions<AuthOptions> _authOptions;

    public IndexModel(IOptions<AuthOptions> authOptions, IStringLocalizerFactory localizerFactory)
    {
        _authOptions = authOptions;
        Localizer = localizerFactory.Create("Pages.Index", Assembly.GetExecutingAssembly().GetName().Name);
    }

    public void OnGet()
    {
        ViewData["Domain"] = _authOptions.Value.Domain;
        ViewData["ClientId"] = _authOptions.Value.FrontendClientId;
        ViewData["Audience"] = _authOptions.Value.Audience;
        ViewData["Scope"] = _authOptions.Value.Scope;
    }
}
