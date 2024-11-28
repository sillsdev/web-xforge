using System;
using System.Collections.Generic;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using Newtonsoft.Json;
using SIL.XForge.Configuration;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Various settings and values to be used in the Razor pages.
/// </summary>
/// <param name="configuration">The dotnet website configuration.</param>
/// <param name="httpContextAccessor">The HTTP context accessor.</param>
/// <param name="siteOptions">The site options from the website configuration.</param>
public class RazorPageSettings(
    IConfiguration configuration,
    IHttpContextAccessor httpContextAccessor,
    IOptions<SiteOptions> siteOptions
) : IRazorPageSettings
{
    public string GetBugsnagConfig() =>
        JsonConvert.SerializeObject(
            new Dictionary<string, object>
            {
                { "apiKey", configuration.GetValue<string>("Bugsnag:ApiKey") },
                { "appVersion", GetProductVersion() },
                { "notifyReleaseStages", configuration.GetSection("Bugsnag:NotifyReleaseStages").Get<string[]>() },
                { "releaseStage", configuration.GetValue<string>("Bugsnag:ReleaseStage") },
            },
            Formatting.Indented
        );

    public string GetProductVersion() => Product.Version;

    public string GetSiteName() => UseScriptureForgeBranding() ? siteOptions.Value.Name : HostName;

    public bool UseScriptureForgeBranding() =>
        HostName.Contains("scriptureforge.org", StringComparison.OrdinalIgnoreCase)
        || HostName.Contains("localhost", StringComparison.OrdinalIgnoreCase);

    private string HostName { get; } = httpContextAccessor.HttpContext?.Request.Host.Host ?? string.Empty;
}
