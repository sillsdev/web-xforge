using System.Collections.Generic;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Newtonsoft.Json;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.ViewComponents;

/// <summary>Provides a global shared footer with common logic for all pages</summary>
public class FooterViewComponent(IConfiguration configuration) : ViewComponent
{
    public IViewComponentResult Invoke()
    {
        var bugsnagConfig = new Dictionary<string, object>
        {
            { "apiKey", configuration.GetValue<string>("Bugsnag:ApiKey") },
            { "appVersion", Product.Version },
            { "notifyReleaseStages", configuration.GetSection("Bugsnag:NotifyReleaseStages").Get<string[]>() },
            { "releaseStage", configuration.GetValue<string>("Bugsnag:ReleaseStage") },
        };
        var appSettings = new RazorPageSettings
        {
            ProductVersion = Product.Version,
            BugsnagConfig = JsonConvert.SerializeObject(bugsnagConfig, Formatting.Indented),
        };

        return View(appSettings);
    }
}
