using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;

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
            services.AddSingleton<IGuidService, GuidService>();
            services.AddSingleton<ISFProjectService, SFProjectService>();
            services.AddSingleton<ISFRightsService, SFRightsService>();
            services.AddSingleton<IProjectService, SFProjectService>();
            services.AddSingleton<IJwtTokenHelper, JwtTokenHelper>();
            services.AddSingleton<IParatextDataHelper, ParatextDataHelper>();
            services.AddSingleton<IInternetSharedRepositorySourceProvider, InternetSharedRepositorySourceProvider>();
            services.AddSingleton<ITransceleratorService, TransceleratorService>();
            services.AddSingleton<ISFRestClientFactory, SFDblRestClientFactory>();
            services.AddSingleton<IHgWrapper, HgWrapper>();
            return services;
        }
    }
}
