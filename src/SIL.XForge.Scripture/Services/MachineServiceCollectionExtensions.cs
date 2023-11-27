using System;
using System.IO;
using System.Net;
using System.Net.Http;
using IdentityModel.Client;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Polly;
using Serval.Client;
using SIL.Machine.WebApi.Services;
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
        var siteOptions = configuration.GetOptions<SiteOptions>();
        var dataAccessOptions = configuration.GetOptions<DataAccessOptions>();
        services
            .AddMachine(config =>
            {
                config.AuthenticationSchemes = new[] { JwtBearerDefaults.AuthenticationScheme };
                config.Namespace = "machine-api/v1";
            })
            .AddEngineOptions(o => o.EnginesDir = Path.Combine(siteOptions.SiteDir, "engines"))
            .AddMongoDataAccess(o =>
            {
                o.ConnectionString = dataAccessOptions.ConnectionString;
                o.MachineDatabaseName = "xforge_machine";
            })
            .AddTextCorpus<SFTextCorpusFactory>();
        services.AddSingleton<ISFTextCorpusFactory, SFTextCorpusFactory>();
        services.AddSingleton<IAuthorizationHandler, MachineAuthorizationHandler>();
        services.AddSingleton<IBuildHandler, SFBuildHandler>();

        // Setup the Machine API
        var servalOptions = configuration.GetOptions<ServalOptions>();
        services.AddAccessTokenManagement(options =>
        {
            options
                .Client
                .Clients
                .Add(
                    MachineApi.HttpClientName,
                    new ClientCredentialsTokenRequest
                    {
                        Address = servalOptions.TokenUrl,
                        ClientId = servalOptions.ClientId,
                        ClientSecret = servalOptions.ClientSecret,
                        Parameters = new Parameters { { "audience", servalOptions.Audience } },
                    }
                );
        });
        services
            .AddClientAccessTokenHttpClient(
                MachineApi.HttpClientName,
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
        services.AddSingleton<IDataFilesClient, DataFilesClient>(sp =>
        {
            // Instantiate the data files client with our named HTTP client
            var factory = sp.GetService<IHttpClientFactory>();
            var httpClient = factory.CreateClient(MachineApi.HttpClientName);
            return new DataFilesClient(httpClient);
        });
        services.AddSingleton<IMachineApiService, MachineApiService>();
        services.AddSingleton<IMachineProjectService, MachineProjectService>();
        services.AddSingleton<IPreTranslationService, PreTranslationService>();
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
