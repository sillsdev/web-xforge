using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace SIL.XForge.Configuration
{
    public static class ConfigurationServiceCollectionExtensions
    {
        public static IServiceCollection AddConfiguration(
            this IServiceCollection services,
            IConfiguration configuration
        )
        {
            services.AddOptions<DataAccessOptions>(configuration);
            services.AddOptions<SiteOptions>(configuration);
            services.AddOptions<ParatextOptions>(configuration);
            services.AddOptions<RealtimeOptions>(configuration);
            services.AddOptions<AuthOptions>(configuration);
            services.AddOptions<AudioOptions>(configuration);
            return services;
        }

        public static IServiceCollection AddOptions<T>(this IServiceCollection services, IConfiguration configuration)
            where T : class
        {
            string sectionName = Options.GetSectionName<T>();
            services.Configure<T>(configuration.GetSection(sectionName));
            return services;
        }
    }
}
