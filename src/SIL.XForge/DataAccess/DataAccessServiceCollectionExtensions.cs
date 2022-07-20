using System;
using Hangfire;
using Hangfire.Mongo;
using Microsoft.Extensions.Configuration;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Bson.Serialization.Conventions;
using MongoDB.Driver;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;

namespace Microsoft.Extensions.DependencyInjection
{
    public static class DataAccessServiceCollectionExtensions
    {
        public static IServiceCollection AddDataAccess(this IServiceCollection services, IConfiguration configuration)
        {
            var options = configuration.GetOptions<DataAccessOptions>();
            string jobDatabaseName = options.JobDatabaseName ?? options.Prefix + "_jobs";
            services.AddHangfire(
                x =>
                    x.UseMongoStorage(
                        $"{options.ConnectionString}/{jobDatabaseName}",
                        new MongoStorageOptions
                        {
                            MigrationOptions = new MongoMigrationOptions { Strategy = MongoMigrationStrategy.Migrate }
                        }
                    )
            );

            DataAccessClassMap.RegisterConventions(
                "SIL.XForge",
                new CamelCaseElementNameConvention(),
                new EnumRepresentationConvention(BsonType.String),
                new IgnoreIfNullConvention(true)
            );

            DataAccessClassMap.RegisterClass<Json0Snapshot>(cm => cm.MapIdProperty(e => e.Id));
            DataAccessClassMap.RegisterClass<ProjectSecret>(cm => cm.MapIdProperty(e => e.Id));

            services.AddSingleton<IMongoClient>(sp => new MongoClient(options.ConnectionString));
            services.AddSingleton(sp => sp.GetService<IMongoClient>().GetDatabase(options.MongoDatabaseName));

            services.AddMongoRepository<UserSecret>("user_secrets", cm => cm.MapIdProperty(us => us.Id));

            return services;
        }

        public static void AddMongoRepository<T>(
            this IServiceCollection services,
            string collection,
            Action<BsonClassMap<T>> mapSetup = null,
            Action<IMongoIndexManager<T>> indexSetup = null
        ) where T : IIdentifiable
        {
            DataAccessClassMap.RegisterClass(mapSetup);
            services.AddSingleton<IRepository<T>>(sp => CreateMongoRepository(sp, collection, indexSetup));
        }

        private static MongoRepository<T> CreateMongoRepository<T>(
            IServiceProvider sp,
            string collection,
            Action<IMongoIndexManager<T>> indexSetup
        ) where T : IIdentifiable
        {
            return new MongoRepository<T>(
                sp.GetService<IMongoDatabase>().GetCollection<T>(collection),
                c => indexSetup?.Invoke(c.Indexes)
            );
        }
    }
}
