using Microsoft.Extensions.Configuration;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Serializers;
using MongoDB.Driver;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Scripture.Models;

namespace Microsoft.Extensions.DependencyInjection
{
    public static class SFDataAccessServiceCollectionExtensions
    {
        public static IServiceCollection AddSFDataAccess(this IServiceCollection services,
            IConfiguration configuration)
        {
            services.AddDataAccess(configuration);

            DataAccessClassMap.RegisterConcreteClass<ProjectUserEntity, SFProjectUserEntity>();

            DataAccessClassMap.RegisterClass<SyncUser>(cm =>
                {
                    cm.SetIdMember(null);
                    cm.MapProperty(su => su.Id).SetSerializer(new StringSerializer(BsonType.ObjectId));
                });

            services.AddMongoRepository<SFProjectEntity>(RootDataTypes.Projects,
                indexSetup: indexes =>
                {
                    IndexKeysDefinitionBuilder<SFProjectEntity> builder = Builders<SFProjectEntity>.IndexKeys;
                    indexes.CreateOrUpdate(new CreateIndexModel<SFProjectEntity>(builder.Ascending("Users.Id"),
                        new CreateIndexOptions { Unique = true }));
                    indexes.CreateOrUpdate(new CreateIndexModel<SFProjectEntity>(builder.Ascending("Users.UserRef")));
                });
            services.AddMongoRepository<TranslateMetrics>(SFRootDataTypes.TranslateMetrics,
                cm => cm.MapProperty(m => m.SessionId).SetSerializer(new StringSerializer(BsonType.ObjectId)));

            return services;
        }
    }
}
