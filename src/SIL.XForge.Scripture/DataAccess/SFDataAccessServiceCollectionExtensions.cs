using Microsoft.Extensions.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Scripture.Models;

namespace Microsoft.Extensions.DependencyInjection
{
    public static class SFDataAccessServiceCollectionExtensions
    {
        public static IServiceCollection AddSFDataAccess(this IServiceCollection services, IConfiguration configuration)
        {
            services.AddDataAccess(configuration);

            DataAccessClassMap.RegisterClass<ParatextUserProfile>(
                cm => cm.GetMemberMap(c => c.SFUserId).SetElementName("sfUserId")
            );

            services.AddMongoRepository<TranslateMetrics>("translate_metrics", cm => cm.MapIdProperty(tm => tm.Id));
            services.AddMongoRepository<SFProjectSecret>("sf_project_secrets");
            services.AddMongoRepository<SyncMetrics>("sync_metrics", cm => cm.MapIdProperty(sm => sm.Id));

            return services;
        }
    }
}
