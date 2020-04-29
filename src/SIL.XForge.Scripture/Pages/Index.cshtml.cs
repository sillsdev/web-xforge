using System.Collections.Generic;
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
        private readonly IOptions<AuthOptions> _authOptions;
        private readonly IConfiguration _configuration;
        private readonly IStringLocalizer _localizer;

        public IndexModel(IOptions<AuthOptions> authOptions, IConfiguration configuration,
            IStringLocalizerFactory localizerFactory)
        {
            _authOptions = authOptions;
            _configuration = configuration;
            _localizer = localizerFactory.Create("Pages.Index",
                System.Reflection.Assembly.GetExecutingAssembly().GetName().Name); ;
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
            ViewData["AboutParatextDescription"] =
                _localizer["AboutParatextDescription", "<span class=\"highlight\">", "</span>"];
            ViewData["AboutFlexibleDescription"] =
                _localizer["AboutFlexibleDescription", "<span class=\"highlight\">", "</span>"];
            ViewData["AboutUserEngagementDescription"] =
                _localizer["AboutUserEngagementDescription", "<span class=\"highlight\">", "</span>"];
        }
    }
}
