using System.Reflection;
using System.Web;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Options;
using SIL.XForge.Configuration;

namespace SIL.XForge.Scripture.Pages
{
    public class IndexModel : PageModel
    {
        public IStringLocalizer Localizer { get; }

        private readonly IOptions<AuthOptions> _authOptions;
        private readonly IOptions<SiteOptions> _siteOptions;

        public IndexModel(IOptions<AuthOptions> authOptions, IOptions<SiteOptions> siteOptions, IStringLocalizerFactory localizerFactory)
        {
            _authOptions = authOptions;
            _siteOptions = siteOptions;
            Localizer = localizerFactory.Create("Pages.Index", Assembly.GetExecutingAssembly().GetName().Name);
        }

        public void OnGet()
        {
            ViewData["Domain"] = _authOptions.Value.Domain;
            ViewData["ClientId"] = _authOptions.Value.FrontendClientId;
            ViewData["Audience"] = _authOptions.Value.Audience;
            ViewData["Scope"] = _authOptions.Value.Scope;
            ViewData["Origin"] = HttpUtility.UrlEncode(_siteOptions.Value.Origin.ToString());
        }
    }
}
