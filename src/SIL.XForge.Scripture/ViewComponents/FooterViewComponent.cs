using System.Collections.Generic;
using System.Reflection;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using Newtonsoft.Json;
using SIL.XForge.Configuration;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.ViewComponents
{
    /// <summary>Provides a global shared footer with common logic for all pages</summary>
    public class FooterViewComponent : ViewComponent
    {
        private readonly IOptions<AuthOptions> authOptions;
        private readonly IOptions<SiteOptions> siteOptions;
        private readonly IConfiguration configuration;

        public FooterViewComponent(
            IOptions<AuthOptions> authOptions,
            IOptions<SiteOptions> siteOptions,
            IConfiguration configuration
        )
        {
            this.authOptions = authOptions;
            this.siteOptions = siteOptions;
            this.configuration = configuration;
        }

        public IViewComponentResult Invoke()
        {
            var appSettings = new RazorPageSettings();
            var location = Assembly.GetEntryAssembly().Location;
            appSettings.ProductVersion = System.Diagnostics.FileVersionInfo.GetVersionInfo(location).ProductVersion;

            var bugsnagConfig = new Dictionary<string, object>
            {
                { "apiKey", configuration.GetValue<string>("Bugsnag:ApiKey") },
                { "appVersion", appSettings.ProductVersion },
                { "notifyReleaseStages", configuration.GetSection("Bugsnag:NotifyReleaseStages").Get<string[]>() },
                { "releaseStage", configuration.GetValue<string>("Bugsnag:ReleaseStage") }
            };
            appSettings.BugsnagConfig = JsonConvert.SerializeObject(bugsnagConfig, Formatting.Indented);

            return View(appSettings);
        }
    }
}
