using Microsoft.Extensions.Configuration;
using MongoDB.Driver;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Scripture.Models;

namespace Microsoft.Extensions.DependencyInjection;

public static class SFDataAccessServiceCollectionExtensions
{
    public static IServiceCollection AddSFDataAccess(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDataAccess(configuration);

        DataAccessClassMap.RegisterClass<ParatextUserProfile>(cm =>
            cm.GetMemberMap(c => c.SFUserId).SetElementName("sfUserId")
        );

        services.AddMongoRepository<TranslateMetrics>("translate_metrics", cm => cm.MapIdProperty(tm => tm.Id));
        services.AddMongoRepository<SFProjectSecret>(
            "sf_project_secrets",
            null,
            idx =>
                idx.CreateMany(
                    [
                        new CreateIndexModel<SFProjectSecret>(
                            Builders<SFProjectSecret>.IndexKeys.Ascending(ps => ps.ServalData.PreTranslationEngineId)
                        ),
                        // The C# Driver still does not support fluent syntax for multi-key indexes.
                        // See https://jira.mongodb.org/browse/CSHARP-1309
                        new CreateIndexModel<SFProjectSecret>(
                            Builders<SFProjectSecret>.IndexKeys.Ascending(
                                $"{nameof(SFProjectSecret.ShareKeys)}.{nameof(ShareKey.Key)}"
                            )
                        ),
                    ]
                )
        );
        services.AddMongoRepository<SyncMetrics>(
            "sync_metrics",
            cm => cm.MapIdProperty(sm => sm.Id),
            im =>
                im.CreateOne(
                    new CreateIndexModel<SyncMetrics>(Builders<SyncMetrics>.IndexKeys.Ascending(sm => sm.ProjectRef))
                )
        );

        return services;
    }
}
