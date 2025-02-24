using System;
using System.Diagnostics.CodeAnalysis;
using System.Net;
using System.Net.Http;
using Duende.IdentityModel.Client;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Polly;
using Serval.Client;
using SIL.XForge.Configuration;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;

namespace Microsoft.Extensions.DependencyInjection;

[ExcludeFromCodeCoverage(Justification = "This logic will only work in a valid ASP.NET Core Context")]
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
                    client.TokenEndpoint = servalOptions.TokenUrl;
                    client.ClientId = servalOptions.ClientId;
                    client.ClientSecret = servalOptions.ClientSecret;
                    client.Parameters = new Parameters { { "audience", servalOptions.Audience } };
                }
            );
        services
            .AddClientCredentialsHttpClient(
                MachineApi.HttpClientName,
                MachineApi.TokenClientName,
                configureClient: client => client.BaseAddress = new Uri(servalOptions.ApiServer)
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
            .AddPolicyHandler(GetRetryPolicy())
            .AddPolicyHandler(GetCircuitBreakerPolicy());
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

    private static IAsyncPolicy<HttpResponseMessage> GetRetryPolicy() =>
        Policy<HttpResponseMessage>
            .Handle<HttpRequestException>()
            .OrResult(r => r.StatusCode >= HttpStatusCode.InternalServerError)
            .WaitAndRetryAsync(6, retryAttempt => TimeSpan.FromSeconds(Math.Pow(2, retryAttempt)));

    private static IAsyncPolicy<HttpResponseMessage> GetCircuitBreakerPolicy() =>
        Policy<HttpResponseMessage>
            .Handle<HttpRequestException>()
            .OrResult(r => r.StatusCode >= HttpStatusCode.InternalServerError)
            .CircuitBreakerAsync(5, TimeSpan.FromSeconds(30));
}
