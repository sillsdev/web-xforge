using System.Reflection;
using System.Web;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Options;
using SIL.XForge.Configuration;

namespace SIL.XForge.Scripture.Pages;

public class LearnMoreModel : PageModel
{
    public IStringLocalizer Localizer { get; }

    private readonly IOptions<SiteOptions> _siteOptions;

    public LearnMoreModel(IOptions<SiteOptions> siteOptions, IStringLocalizerFactory localizerFactory)
    {
        _siteOptions = siteOptions;
        Localizer = localizerFactory.Create("Pages.LearnMore", Assembly.GetExecutingAssembly().GetName().Name);
    }

    public void OnGet()
    {
        ViewData["Scheme"] = _siteOptions.Value.Origin.Scheme;
        ViewData["Origin"] = HttpUtility.UrlEncode(_siteOptions.Value.Origin.ToString());
    }
}
