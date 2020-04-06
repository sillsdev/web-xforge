using System.Collections.Generic;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Newtonsoft.Json;
using SIL.XForge.Configuration;

namespace SIL.XForge.Scripture.Pages
{
    public class IndexModel : PageModel
    {
        private readonly IOptions<AuthOptions> _authOptions;
        private readonly IConfiguration _configuration;

        public IndexModel(IOptions<AuthOptions> authOptions, IConfiguration configuration)
        {
            _authOptions = authOptions;
            _configuration = configuration;
        }

        public void OnGet()
        {
            ViewData["ProductVersion"] = System.Diagnostics.FileVersionInfo.GetVersionInfo(@System.Reflection.Assembly.GetEntryAssembly().Location).ProductVersion;

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
        }
    }
}
