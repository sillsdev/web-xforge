using System.Collections.Generic;
using System.Reflection;
using System.Web;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Options;
using Newtonsoft.Json;
using SIL.XForge.Configuration;

namespace SIL.XForge.Scripture.Pages
{
    public class IndexModel : PageModel
    {
        public IStringLocalizer Localizer { get; }
        public IStringLocalizer ExtraLocalizer { get; }

        private readonly IOptions<AuthOptions> _authOptions;
        private readonly IOptions<SiteOptions> _siteOptions;
        private readonly IConfiguration _configuration;

        public IndexModel(IOptions<AuthOptions> authOptions, IOptions<SiteOptions> siteOptions,
            IConfiguration configuration, IStringLocalizerFactory localizerFactory)
        {
            Localizer = localizerFactory.Create("Pages.Index", Assembly.GetExecutingAssembly().GetName().Name);
            ExtraLocalizer = localizerFactory.Create("Pages._IndexExtraPartial",
                Assembly.GetExecutingAssembly().GetName().Name);
            _authOptions = authOptions;
            _siteOptions = siteOptions;
            _configuration = configuration;
        }

        public void OnGet()
        {
            var location = Assembly.GetEntryAssembly().Location;
            ViewData["ProductVersion"] = System.Diagnostics.FileVersionInfo.GetVersionInfo(location).ProductVersion;

            var bugsnagConfig = new Dictionary<string, object>
                {
                    { "apiKey", _configuration.GetValue<string>("Bugsnag:ApiKey") },
                    { "appVersion", ViewData["ProductVersion"] },
                    { "notifyReleaseStages", _configuration.GetSection("Bugsnag:NotifyReleaseStages").Get<string[]>() },
                    { "releaseStage", _configuration.GetValue<string>("Bugsnag:ReleaseStage") }
                };
            ViewData["BugsnagConfig"] = JsonConvert.SerializeObject(bugsnagConfig, Formatting.Indented);

            ViewData["Domain"] = _authOptions.Value.Domain;
            ViewData["ClientId"] = _authOptions.Value.FrontendClientId;
            ViewData["Audience"] = _authOptions.Value.Audience;
            ViewData["Scope"] = _authOptions.Value.Scope;
            ViewData["Origin"] = HttpUtility.UrlEncode(_siteOptions.Value.Origin.ToString());
        }
    }
}
