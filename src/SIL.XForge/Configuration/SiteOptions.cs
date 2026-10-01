using System;
using System.Collections.Generic;
using System.Linq;

namespace SIL.XForge.Configuration;

public class SiteOptions
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Origin { get; set; } = string.Empty;
    public string SmtpServer { get; set; } = string.Empty;
    public string PortNumber { get; set; } = string.Empty;
    public string EmailFromAddress { get; set; } = string.Empty;
    public bool SendEmail { get; set; }
    public string IssuesEmail { get; set; } = string.Empty;
    public string SiteDir { get; set; } = string.Empty;
    public string SharedDir { get; set; } = string.Empty;
    public Uri WebsiteUrl => new Uri(Origin.Split(';')[0], UriKind.Absolute);

    /// <summary>
    /// Gets the host names of the origins in <see cref="Origin"/>, which is a semicolon-separated list of absolute
    /// URLs such as "https://scriptureforge.org;https://example.org".
    /// </summary>
    /// <exception cref="InvalidOperationException">
    /// <see cref="Origin"/> has no entries, or an entry is not an absolute http or https URL.
    /// </exception>
    public string[] GetOriginHosts()
    {
        string[] origins = Origin.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (origins.Length == 0)
            throw new InvalidOperationException("Site:Origin does not specify any origins.");

        var hosts = new List<string>();
        foreach (string origin in origins)
        {
            if (
                !Uri.TryCreate(origin, UriKind.Absolute, out Uri? uri)
                || (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp)
            )
            {
                throw new InvalidOperationException(
                    $"Site:Origin contains '{origin}', which is not an absolute http or https URL."
                );
            }

            if (!hosts.Contains(uri.Host, StringComparer.OrdinalIgnoreCase))
                hosts.Add(uri.Host);
        }

        return [.. hosts];
    }
}
