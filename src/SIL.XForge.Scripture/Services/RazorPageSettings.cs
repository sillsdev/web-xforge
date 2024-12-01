using System;
using System.Collections.Generic;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using Newtonsoft.Json;
using SIL.XForge.Configuration;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Various settings and values to be used in the Razor pages.
/// </summary>
/// <param name="authOptions">The authentication options from the website configuration.</param>
/// <param name="bugsnagOptions">The Bugsnag options from the website configuration.</param>
/// <param name="httpContextAccessor">The HTTP context accessor.</param>
/// <param name="siteOptions">The site options from the website configuration.</param>
public class RazorPageSettings(
    IOptions<AuthOptions> authOptions,
    IOptions<BugsnagOptions> bugsnagOptions,
    IHttpContextAccessor httpContextAccessor,
    IOptions<SiteOptions> siteOptions
) : IRazorPageSettings
{
    public PublicAuthOptions GetAuthOptions() => authOptions.Value;

    public string GetBugsnagConfig() =>
        JsonConvert.SerializeObject(
            new Dictionary<string, object>
            {
                { "apiKey", bugsnagOptions.Value.ApiKey },
                { "appVersion", GetProductVersion() },
                { "notifyReleaseStages", bugsnagOptions.Value.NotifyReleaseStages },
                { "releaseStage", bugsnagOptions.Value.ReleaseStage },
            },
            Formatting.Indented
        );

    public string GetProductVersion() => Product.Version;

    public string GetSiteName() => UseScriptureForgeBranding() ? siteOptions.Value.Name : HostName;

    public bool UseScriptureForgeBranding() =>
        HostName.Contains("scriptureforge.org", StringComparison.OrdinalIgnoreCase)
        || HostName.Contains("localhost", StringComparison.OrdinalIgnoreCase);

    private string HostName => httpContextAccessor.HttpContext?.Request.Host.Host ?? string.Empty;
}
