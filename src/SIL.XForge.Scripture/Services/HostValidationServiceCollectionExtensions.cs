using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.HostFiltering;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Configuration;
using SIL.XForge.Configuration;

namespace Microsoft.Extensions.DependencyInjection;

public static class HostValidationServiceCollectionExtensions
{
    /// <summary>
    /// Only treats a request as being for one of the hosts in <see cref="SiteOptions.Origin"/>.
    /// </summary>
    /// <remarks>
    /// Absolute URLs, such as the links in invitation emails, are built from the request's host, so an unchecked host
    /// would let a caller choose where they point. The host can come from the Host header or, through the forwarded
    /// headers middleware, from X-Forwarded-Host, so both are restricted. The hosts are read here rather than in an
    /// options callback so that a bad Site:Origin fails when the app starts.
    /// </remarks>
    public static IServiceCollection AddHostValidation(this IServiceCollection services, IConfiguration configuration)
    {
        string[] allowedHosts = configuration.GetOptions<SiteOptions>().GetOriginHosts();
        services.Configure<HostFilteringOptions>(options => options.AllowedHosts = allowedHosts);
        services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.All;
            options.AllowedHosts = allowedHosts;
        });
        return services;
    }
}
