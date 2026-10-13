using System;
using Amazon;
using Amazon.S3;
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
    /// Adds the appropriate storage provider base don the application configuration.
    /// </summary>
    /// <param name="services">The services.</param>
    /// <param name="configuration">The configuration.</param>
    /// <returns>The services.</returns>
    public static IServiceCollection AddStorageProvider(this IServiceCollection services, IConfiguration configuration)
    {
        var options = configuration.GetOptions<StorageConfigOptions>();
        if (options.StorageProvider == StorageConfigOptions.S3)
        {
            services.AddSingleton<IAmazonS3>(_ => GetAmazonS3Client(options));
            services.AddScoped<IStorageProvider, S3StorageProvider>();
        }
        else
        {
            services.AddScoped<IStorageProvider, FileSystemStorageProvider>();
        }

        return services;
    }

    /// <summary>
    /// Gets an Amazon S3 Client for the specified configuration.
    /// </summary>
    /// <param name="options">The storage configuration options.</param>
    /// <returns>The Amazon S3 Client.</returns>
    private static AmazonS3Client GetAmazonS3Client(StorageConfigOptions options)
    {
        // Load S3 configuration
        var config = new AmazonS3Config();
        if (!string.IsNullOrWhiteSpace(options.S3ServiceUrl))
        {
            config.ServiceURL = options.S3ServiceUrl;
            config.ForcePathStyle = true;
            config.UseHttp = options.S3ServiceUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase);
        }
        else
        {
            config.RegionEndpoint = RegionEndpoint.GetBySystemName(options.S3Region);
        }

        // Use the credentials in the AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables
        return new AmazonS3Client(config);
    }
}
