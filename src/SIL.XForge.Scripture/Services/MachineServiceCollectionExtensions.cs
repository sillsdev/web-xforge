using System;
using System.IO;
using System.Net.Http;
using IdentityModel.Client;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using SIL.Machine.WebApi.Services;
using SIL.XForge.Configuration;
using SIL.XForge.Scripture.Services;

namespace Microsoft.Extensions.DependencyInjection
{
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
                })
                .AddEngineOptions(o => o.EnginesDir = Path.Combine(siteOptions.SiteDir, "engines"))
                .AddMongoDataAccess(o =>
                {
                    o.ConnectionString = dataAccessOptions.ConnectionString;
                    o.MachineDatabaseName = "xforge_machine";
                })
                .AddTextCorpus<SFTextCorpusFactory>();
            services.AddSingleton<IAuthorizationHandler, MachineAuthorizationHandler>();
            services.AddSingleton<IBuildHandler, SFBuildHandler>();

            // Setup the Machine API
            var machineOptions = configuration.GetOptions<MachineOptions>();
            services.AddAccessTokenManagement(options =>
            {
                options.Client.Clients.Add(
                    MachineProjectService.ClientName,
                    new ClientCredentialsTokenRequest
                    {
                        Address = machineOptions.TokenUrl,
                        ClientId = machineOptions.ClientId,
                        ClientSecret = machineOptions.ClientSecret,
                        Parameters = new Parameters { { "audience", machineOptions.Audience }, },
                    }
                );
            });
            services
                .AddClientAccessTokenHttpClient(
                    MachineProjectService.ClientName,
                    configureClient: client =>
                    {
                        client.BaseAddress = new Uri(machineOptions.ApiServer);
                    }
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
            services.AddSingleton<IMachineProjectService, MachineProjectService>();
            services.AddSingleton<IMachineCorporaService, MachineCorporaService>();
            return services;
        }
    }
}
