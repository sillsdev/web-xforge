using System.Reflection;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Options;
using SIL.XForge.Configuration;

namespace SIL.XForge.Scripture.Pages;

public class ErrorModel : PageModel
{
    public IStringLocalizer Localizer { get; }
    public int ErrorStatusCode { get; set; }
    public bool RedirectToHome { get; set; }
    private readonly IOptions<SiteOptions> _siteOptions;

    public ErrorModel(IOptions<SiteOptions> siteOptions, IStringLocalizerFactory localizerFactory)
    {
        _siteOptions = siteOptions;
        Localizer = localizerFactory.Create("Pages.NotFound", Assembly.GetExecutingAssembly().GetName().Name);
    }

    public void OnGet(int code)
    {
        ViewData["Origin"] = _siteOptions.Value.Origin.ToString();
        ErrorStatusCode = code;
        RedirectToHome = ErrorStatusCode == 404;
    }
}
