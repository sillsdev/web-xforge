using System;
using Hangfire;
using Hangfire.Mongo;
using Humanizer;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Bson.Serialization.Conventions;
using MongoDB.Bson.Serialization.IdGenerators;
using MongoDB.Bson.Serialization.Serializers;
using MongoDB.Driver;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;

namespace Microsoft.Extensions.DependencyInjection
{
    public static class DataAccessServiceCollectionExtensions
    {
        public static IServiceCollection AddDataAccess(this IServiceCollection services,
            IConfiguration configuration)
        {
            var options = configuration.GetOptions<DataAccessOptions>();
            services.AddHangfire(x => x.UseMongoStorage(options.ConnectionString,
                options.JobDatabaseName ?? options.Prefix + "_jobs",
                new MongoStorageOptions
                {
                    MigrationOptions = new MongoMigrationOptions
                    {
                        Strategy = MongoMigrationStrategy.Migrate
                    }
                }));

            DataAccessClassMap.RegisterConventions("SIL.XForge",
                new CamelCaseElementNameConvention(),
                new EnumRepresentationConvention(BsonType.String),
                new IgnoreIfNullConvention(true));

            DataAccessClassMap.RegisterClass<Entity>(cm =>
            {
                cm.MapIdProperty(e => e.Id)
                    .SetIdGenerator(StringObjectIdGenerator.Instance)
                    .SetSerializer(new StringSerializer());
            });

            DataAccessClassMap.RegisterClass<RealtimeDocEntity>(cm =>
            {
                cm.MapIdProperty(e => e.Id)
                    .SetSerializer(new StringSerializer());
            });

            DataAccessClassMap.RegisterClass<ProjectUserEntity>(cm =>
            {
                cm.SetIdMember(null);
                cm.MapProperty(u => u.Id).SetSerializer(new StringSerializer(BsonType.ObjectId));
                cm.UnmapProperty(u => u.ProjectRef);
            });

            services.AddSingleton<IMongoClient>(sp => new MongoClient(options.ConnectionString));
            services.AddSingleton<IMongoDatabase>(
                sp => sp.GetService<IMongoClient>().GetDatabase(options.MongoDatabaseName));

            services.AddMongoRepository<UserSecret>(RootDataTypes.UserSecrets);
            services.AddMongoReadOnlyRepository<User>(RootDataTypes.Users);

            return services;
        }

        public static void AddMongoRepository<T>(this IServiceCollection services, string type,
            Action<BsonClassMap<T>> mapSetup = null, Action<IMongoIndexManager<T>> indexSetup = null) where T : IEntity
        {
            DataAccessClassMap.RegisterClass(mapSetup);
            services.AddSingleton<IRepository<T>>(sp => CreateMongoRepository(sp, type, indexSetup));
            services.AddSingleton<IReadOnlyRepository<T>>(sp => sp.GetService<IRepository<T>>());
        }

        public static void AddMongoReadOnlyRepository<T>(this IServiceCollection services, string type,
            Action<BsonClassMap<T>> mapSetup = null, Action<IMongoIndexManager<T>> indexSetup = null) where T : IEntity
        {
            DataAccessClassMap.RegisterClass(mapSetup);
            services.AddSingleton<IReadOnlyRepository<T>>(sp => CreateMongoRepository(sp, type, indexSetup));
        }

        private static MongoRepository<T> CreateMongoRepository<T>(IServiceProvider sp, string type,
            Action<IMongoIndexManager<T>> indexSetup) where T : IEntity
        {
            var options = sp.GetService<IOptions<DataAccessOptions>>();
            string collection = type.Underscore();
            if (type == RootDataTypes.Projects)
                collection = $"{options.Value.Prefix}_{collection}";
            return new MongoRepository<T>(sp.GetService<IMongoDatabase>().GetCollection<T>(collection),
                c => indexSetup?.Invoke(c.Indexes));
        }
    }
}
