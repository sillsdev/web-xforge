using System.Collections.Generic;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SIL.XForge.Configuration;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;

namespace Microsoft.Extensions.DependencyInjection
{
    /// <summary>
    /// This class is used to add the SF real-time server to the DI container.
    /// </summary>
    public static class SFRealtimeServiceCollectionExtensions
    {
        public static IServiceCollection AddSFRealtimeServer(this IServiceCollection services,
            ILoggerFactory loggerFactory, IConfiguration configuration, bool launchWithDebugging = false)
        {
            services.AddRealtimeServer(loggerFactory, configuration, o =>
                {
                    o.AppModuleName = "scriptureforge";
                    o.ProjectDoc = new DocConfig("sf_projects", typeof(SFProject));
                    o.ProjectDataDocs.AddRange(new[]
                    {
                        new DocConfig("sf_project_user_configs", typeof(SFProjectUserConfig)),
                        new DocConfig("texts", typeof(TextData), OTType.RichText),
                        new DocConfig("questions", typeof(Question))
                    });
                    o.UserDataDocs.AddRange(new[]
                    {
                        new DocConfig("users", typeof(User)),
                        new DocConfig("user_secrets", typeof(UserSecret), null),
                        new DocConfig("sf_project_user_configs", typeof(SFProjectUserConfig))
                    });
                    o.UserDataDocsIdLocation = new Dictionary<string, Location>
                    {
                        { "users", Location.Whole },
                        { "user_secrets", Location.Whole },
                        { "sf_project_user_configs", Location.End }
                    };
                }, launchWithDebugging);
            return services;
        }
    }
}
