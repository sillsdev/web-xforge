using System.Reflection;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Options;
using SIL.XForge.Configuration;

namespace SIL.XForge.Scripture.Pages
{
    public class Status404Model : PageModel
    {
        public IStringLocalizer Localizer { get; }

        private readonly IOptions<SiteOptions> _siteOptions;

        public Status404Model(IOptions<SiteOptions> siteOptions, IStringLocalizerFactory localizerFactory)
        {
            _siteOptions = siteOptions;
            Localizer = localizerFactory.Create("Pages.NotFound", Assembly.GetExecutingAssembly().GetName().Name);
        }

        public void OnGet()
        {
            ViewData["Origin"] = _siteOptions.Value.Origin.ToString();
        }
    }
}
