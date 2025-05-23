using System;
using Hangfire;
using Hangfire.Mongo;
using Hangfire.Mongo.Migration.Strategies;
using Microsoft.Extensions.Configuration;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Bson.Serialization.Conventions;
using MongoDB.Driver;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.EventMetrics;
using SIL.XForge.Models;

namespace Microsoft.Extensions.DependencyInjection;

public static class DataAccessServiceCollectionExtensions
{
    public static IServiceCollection AddDataAccess(this IServiceCollection services, IConfiguration configuration)
    {
        var options = configuration.GetOptions<DataAccessOptions>();
        string jobDatabaseName = options.JobDatabaseName ?? options.Prefix + "_jobs";
        services.AddHangfireServer();
        services.AddHangfire(x =>
            x.UseMongoStorage(
                $"{options.ConnectionString}/{jobDatabaseName}",
                new MongoStorageOptions
                {
                    CheckQueuedJobsStrategy = CheckQueuedJobsStrategy.TailNotificationsCollection,
                    SlidingInvisibilityTimeout = TimeSpan.FromMinutes(10),
                    MigrationOptions = new MongoMigrationOptions
                    {
                        MigrationStrategy = new MigrateMongoMigrationStrategy(),
                    },
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
        services.AddMongoRepository<EventMetric>(
            "event_metrics",
            cm => cm.MapIdProperty(em => em.Id),
            CreateEventMetricsIndexes
        );

        return services;
    }

    public static void AddMongoRepository<T>(
        this IServiceCollection services,
        string collection,
        Action<BsonClassMap<T>>? mapSetup = null,
        Action<IMongoIndexManager<T>>? indexSetup = null
    )
        where T : IIdentifiable
    {
        DataAccessClassMap.RegisterClass(mapSetup);
        services.AddSingleton<IRepository<T>>(sp => CreateMongoRepository(sp, collection, indexSetup));
    }

    /// <summary>
    /// Creates the indexes for <see cref="EventMetric"/> collection.
    /// </summary>
    /// <param name="indexManager">The index manager.</param>
    /// <remarks>
    /// This function is internal for unit testing purposes.
    /// </remarks>
    internal static void CreateEventMetricsIndexes(IMongoIndexManager<EventMetric> indexManager)
    {
        indexManager.CreateMany(
            [
                new CreateIndexModel<EventMetric>(Builders<EventMetric>.IndexKeys.Ascending(em => em.ProjectId)),
                new CreateIndexModel<EventMetric>(
                    Builders<EventMetric>.IndexKeys.Combine(
                        Builders<EventMetric>.IndexKeys.Ascending(em => em.ProjectId),
                        Builders<EventMetric>.IndexKeys.Ascending(em => em.Scope),
                        Builders<EventMetric>.IndexKeys.Ascending(em => em.EventType)
                    )
                ),
            ]
        );
    }

    private static MongoRepository<T> CreateMongoRepository<T>(
        IServiceProvider sp,
        string collection,
        Action<IMongoIndexManager<T>>? indexSetup
    )
        where T : IIdentifiable =>
        new MongoRepository<T>(
            sp.GetService<IMongoDatabase>().GetCollection<T>(collection),
            c => indexSetup?.Invoke(c.Indexes)
        );
}
