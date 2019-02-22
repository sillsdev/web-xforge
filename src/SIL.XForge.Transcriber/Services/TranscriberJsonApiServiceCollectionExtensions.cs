using Autofac;
using Microsoft.Extensions.Configuration;
using SIL.XForge.Transcriber.Services;

namespace Microsoft.Extensions.DependencyInjection
{
    public static class TranscriberJsonApiServiceCollectionExtensions
    {
        public static IServiceCollection AddTranscriberJsonApi(this IServiceCollection services, IMvcBuilder mvcBuilder,
            ContainerBuilder containerBuilder, IConfiguration configuration)
        {
            services.AddJsonApi(mvcBuilder, containerBuilder, configuration, mapConfig =>
            {
                mapConfig.AddProfile<TranscriberMapperProfile>();
            });
            return services;
        }
    }
}
