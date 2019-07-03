using SIL.XForge.Scripture.Services;

namespace Microsoft.Extensions.DependencyInjection
{
    public static class SFServiceCollectionExtensions
    {
        /// <summary>
        /// Adds miscellaneous services that are common to all xForge applications to the DI container.
        /// </summary>
        public static IServiceCollection AddSFServices(this IServiceCollection services)
        {
            services.AddCommonServices();
            services.AddSingleton<ISyncService, SyncService>();
            services.AddSingleton<IParatextService, ParatextService>();
            services.AddTransient<IDeltaUsxMapper, DeltaUsxMapper>();
            services.AddTransient<IParatextNotesMapper, ParatextNotesMapper>();
            return services;
        }
    }
}
