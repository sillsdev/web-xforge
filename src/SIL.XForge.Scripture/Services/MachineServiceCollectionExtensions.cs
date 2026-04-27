#nullable disable warnings
using System;
using System.Net;
using System.Net.Http;
using Duende.AccessTokenManagement;
using Duende.IdentityModel.Client;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Polly;
using Polly.CircuitBreaker;
using Polly.Retry;
using Polly.Timeout;
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
            .AddClientCredentialsTokenManagement()
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

        // Register the M2M token request counter and add it to the back-channel (Auth0) HTTP client so that every
        // token request to Auth0 is logged and counted. This lets developers verify locally that changes which prevent
        // unnecessary token refreshes (e.g., avoiding force-renewal on 401) are working.
        services.AddSingleton<IM2MTokenRequestCounter, M2MTokenRequestCounter>();
        services
            .AddHttpClient(ClientCredentialsTokenManagementDefaults.BackChannelHttpClientName)
            .AddHttpMessageHandler(sp => new M2MTokenRequestBackChannelHandler(
                sp.GetRequiredService<IM2MTokenRequestCounter>(),
                sp.GetRequiredService<ILogger<M2MTokenRequestBackChannelHandler>>()
            ));

        // Register the Serval HTTP client.
        //
        // IMPORTANT: We use AddHttpClient + AddClientCredentialsTokenHandler (instead of the convenience method
        // AddClientCredentialsHttpClient) so that the Duende AccessTokenManagement v4 library does NOT automatically
        // call AddDefaultAccessTokenResiliency(). That automatic resilience layer retries every 401 from Serval with
        // ForceTokenRenewal=true, which causes an extra Auth0 token request on each 401. Removing it means 401s from
        // Serval propagate to callers without triggering unnecessary token refreshes.
        services
            .AddHttpClient(MachineApi.HttpClientName, client => client.BaseAddress = new Uri(servalOptions.ApiServer))
            .AddClientCredentialsTokenHandler(ClientCredentialsClientName.Parse(MachineApi.TokenClientName))
            .SetHandlerLifetime(TimeSpan.FromMinutes(5))
            .AddPolicyHandler(GetRetryPolicy())
            .AddPolicyHandler(GetCircuitBreakerPolicy())
            .AddPolicyHandler(GetTimeoutPolicy())
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
        services.AddSingleton<ITranslationEnginesClient, TranslationEnginesClient>(sp =>
        {
            // Instantiate the translation engines client with our named HTTP client
            var factory = sp.GetService<IHttpClientFactory>();
            var httpClient = factory.CreateClient(MachineApi.HttpClientName);
            return new TranslationEnginesClient(httpClient);
        });
        services.AddSingleton<ITranslationEngineTypesClient, TranslationEngineTypesClient>(sp =>
        {
            // Instantiate the translation engines client with our named HTTP client
            var factory = sp.GetService<IHttpClientFactory>();
            var httpClient = factory.CreateClient(MachineApi.HttpClientName);
            return new TranslationEngineTypesClient(httpClient);
        });
        services.AddSingleton<IDataFilesClient, DataFilesClient>(sp =>
        {
            // Instantiate the data files client with our named HTTP client
            var factory = sp.GetService<IHttpClientFactory>();
            var httpClient = factory.CreateClient(MachineApi.HttpClientName);
            return new DataFilesClient(httpClient);
        });
        services.AddSingleton<ICorporaClient, CorporaClient>(sp =>
        {
            // Instantiate the corpora client with our named HTTP client
            var factory = sp.GetService<IHttpClientFactory>();
            var httpClient = factory.CreateClient(MachineApi.HttpClientName);
            return new CorporaClient(httpClient);
        });
        services.AddSingleton<IMachineApiService, MachineApiService>();
        services.AddSingleton<IMachineProjectService, MachineProjectService>();
        services.AddSingleton<IPreTranslationService, PreTranslationService>();
        services.AddSingleton<ITrainingDataService, TrainingDataService>();
        return services;
    }

    private static AsyncRetryPolicy<HttpResponseMessage> GetRetryPolicy() =>
        Policy<HttpResponseMessage>
            .Handle<HttpRequestException>()
            .OrResult(r => r.StatusCode >= HttpStatusCode.InternalServerError)
            .WaitAndRetryAsync(6, retryAttempt => TimeSpan.FromSeconds(Math.Pow(2, retryAttempt)));

    private static AsyncCircuitBreakerPolicy<HttpResponseMessage> GetCircuitBreakerPolicy() =>
        Policy<HttpResponseMessage>
            .Handle<HttpRequestException>()
            .OrResult(r => r.StatusCode >= HttpStatusCode.InternalServerError)
            .CircuitBreakerAsync(5, TimeSpan.FromSeconds(30));

    private static AsyncTimeoutPolicy<HttpResponseMessage> GetTimeoutPolicy() =>
        // NOTE: The Serval Get Build endpoint has a long polling timeout of 40 seconds,
        // so ensure any timeout values support this
        Policy.TimeoutAsync<HttpResponseMessage>(TimeSpan.FromMinutes(5), TimeoutStrategy.Pessimistic);
}
