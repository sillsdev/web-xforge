using System;
using System.Net;
using System.Net.Http;
using Duende.AccessTokenManagement;
using Duende.IdentityModel.Client;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Http.Resilience;
using Polly;
using Serval.Client;
using SIL.XForge.Configuration;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;

namespace Microsoft.Extensions.DependencyInjection;

public static class MachineServiceCollectionExtensions
{
    public static IServiceCollection AddSFMachine(
        this IServiceCollection services,
        IConfiguration configuration,
        IWebHostEnvironment env
    )
    {
        // Set up the Machine API
        var servalOptions = configuration.GetOptions<ServalOptions>();
        services.AddDistributedMemoryCache();
        services
            .AddClientCredentialsTokenManagement(options =>
            {
                // 10 hours is the token duration specified in Auth0
                const int cacheLifetimeBuffer = 60;
                options.CacheLifetimeBuffer = cacheLifetimeBuffer;
                options.DefaultCacheLifetime = TimeSpan.FromSeconds(36000 - cacheLifetimeBuffer);
                options.LocalCacheExpiration = null;
            })
            .AddClient(
                MachineApi.TokenClientName,
                client =>
                {
                    client.TokenEndpoint = new Uri(servalOptions.TokenUrl, UriKind.Absolute);
                    client.ClientId = ClientId.Parse(servalOptions.ClientId);
                    client.ClientSecret = ClientSecret.Parse(servalOptions.ClientSecret);
                    client.Parameters = new Parameters { { "audience", servalOptions.Audience } };
                }
            );
        services
            .AddClientCredentialsHttpClient(
                MachineApi.HttpClientName,
                ClientCredentialsClientName.Parse(MachineApi.TokenClientName),
                configureClient: client => client.BaseAddress = new Uri(servalOptions.ApiServer, UriKind.Absolute)
            )
            .ConfigurePrimaryHttpMessageHandler(() =>
            {
                var handler = new HttpClientHandler();
                if (env.IsDevelopment() || env.IsEnvironment("Testing"))
                {
                    handler.ServerCertificateCustomValidationCallback =
                        HttpClientHandler.DangerousAcceptAnyServerCertificateValidator;
                }

                return handler;
            });
        services
            .AddHttpClient(MachineApi.HttpClientName)
            .SetHandlerLifetime(TimeSpan.FromMinutes(5))
            .AddResilienceHandler("ServalResilience", ConfigureServalResilience);
        services.AddSingleton<ITranslationEnginesClient, TranslationEnginesClient>(sp =>
        {
            // Instantiate the translation engines client with our named HTTP client
            var factory = sp.GetRequiredService<IHttpClientFactory>();
            var httpClient = factory.CreateClient(MachineApi.HttpClientName);
            return new TranslationEnginesClient(httpClient);
        });
        services.AddSingleton<ITranslationBuildsClient, TranslationBuildsClient>(sp =>
        {
            // Instantiate the translation builds client with our named HTTP client
            var factory = sp.GetRequiredService<IHttpClientFactory>();
            var httpClient = factory.CreateClient(MachineApi.HttpClientName);
            return new TranslationBuildsClient(httpClient);
        });
        services.AddSingleton<ITranslationEngineTypesClient, TranslationEngineTypesClient>(sp =>
        {
            // Instantiate the translation engines client with our named HTTP client
            var factory = sp.GetRequiredService<IHttpClientFactory>();
            var httpClient = factory.CreateClient(MachineApi.HttpClientName);
            return new TranslationEngineTypesClient(httpClient);
        });
        services.AddSingleton<IDataFilesClient, DataFilesClient>(sp =>
        {
            // Instantiate the data files client with our named HTTP client
            var factory = sp.GetRequiredService<IHttpClientFactory>();
            var httpClient = factory.CreateClient(MachineApi.HttpClientName);
            return new DataFilesClient(httpClient);
        });
        services.AddSingleton<ICorporaClient, CorporaClient>(sp =>
        {
            // Instantiate the corpora client with our named HTTP client
            var factory = sp.GetRequiredService<IHttpClientFactory>();
            var httpClient = factory.CreateClient(MachineApi.HttpClientName);
            return new CorporaClient(httpClient);
        });
        services.AddSingleton<IMachineApiService, MachineApiService>();
        services.AddSingleton<IMachineProjectService, MachineProjectService>();
        services.AddSingleton<IPreTranslationService, PreTranslationService>();
        services.AddSingleton<ITrainingDataService, TrainingDataService>();
        services.AddHostedService<MachineBackgroundService>();
        return services;
    }

    private static void ConfigureServalResilience(ResiliencePipelineBuilder<HttpResponseMessage> builder)
    {
        var transientPredicate = new PredicateBuilder<HttpResponseMessage>()
            .Handle<HttpRequestException>()
            .HandleResult(r => r.StatusCode >= HttpStatusCode.InternalServerError);

        builder.AddRetry(
            new HttpRetryStrategyOptions
            {
                ShouldHandle = transientPredicate,
                MaxRetryAttempts = 6,
                Delay = TimeSpan.FromSeconds(2),
                BackoffType = DelayBackoffType.Exponential,
                UseJitter = false,
            }
        );

        builder.AddCircuitBreaker(
            new HttpCircuitBreakerStrategyOptions
            {
                ShouldHandle = transientPredicate,
                FailureRatio = 1.0,
                MinimumThroughput = 5,
                SamplingDuration = TimeSpan.FromSeconds(30),
                BreakDuration = TimeSpan.FromSeconds(30),
            }
        );

        // NOTE: The Serval Get Build endpoint has a long polling timeout of 40 seconds,
        // so ensure any timeout values support this
        builder.AddTimeout(new HttpTimeoutStrategyOptions { Timeout = TimeSpan.FromMinutes(5) });
    }
}
