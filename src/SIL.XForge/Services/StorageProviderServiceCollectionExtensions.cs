using Microsoft.Extensions.Configuration;
using SIL.XForge.Configuration;
using SIL.XForge.Services;

namespace Microsoft.Extensions.DependencyInjection;

/// <summary>
/// Service collection extensions for configuring the storage provider.
/// </summary>
public static class StorageProviderServiceCollectionExtensions
{
    /// <summary>
    /// Adds miscellaneous services that are common to all xForge applications to the DI container.
    /// </summary>
    public static IServiceCollection AddStorageProvider(this IServiceCollection services, IConfiguration configuration)
    {
        var options = configuration.GetOptions<StorageConfigOptions>();
        if (options.StorageProvider == StorageConfigOptions.S3)
        {
            services.AddScoped<IStorageProvider, S3StorageProvider>();
        }
        else
        {
            services.AddScoped<IStorageProvider, FileSystemStorageProvider>();
        }

        return services;
    }
}
