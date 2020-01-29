using System.IO;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Configuration;
using SIL.Machine.WebApi.Services;
using SIL.XForge.Configuration;
using SIL.XForge.Scripture.Services;

namespace Microsoft.Extensions.DependencyInjection
{
    public static class MachineServiceCollectionExtensions
    {
        public static IServiceCollection AddSFMachine(this IServiceCollection services, IConfiguration configuration)
        {
            var siteOptions = configuration.GetOptions<SiteOptions>();
            var dataAccessOptions = configuration.GetOptions<DataAccessOptions>();
            services
                .AddMachine(config =>
                {
                    config.AuthenticationSchemes = new [] { JwtBearerDefaults.AuthenticationScheme };
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
            return services;
        }
    }
}
