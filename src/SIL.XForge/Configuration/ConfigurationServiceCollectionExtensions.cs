using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace SIL.XForge.Configuration;

public static class ConfigurationServiceCollectionExtensions
{
    public static IServiceCollection AddConfiguration(this IServiceCollection services, IConfiguration configuration) =>
        services
            .AddOptions<DataAccessOptions>(configuration)
            .AddOptions<SiteOptions>(configuration)
            .AddOptions<ParatextOptions>(configuration)
            .AddOptions<RealtimeOptions>(configuration)
            .AddOptions<AuthOptions>(configuration)
            .AddOptions<AudioOptions>(configuration)
            .AddOptions<ServalOptions>(configuration)
            .AddOptions<BugsnagOptions>(configuration);

    private static IServiceCollection AddOptions<T>(this IServiceCollection services, IConfiguration configuration)
        where T : class
    {
        string sectionName = Options.GetSectionName<T>();
        services.Configure<T>(configuration.GetSection(sectionName));
        return services;
    }
}
