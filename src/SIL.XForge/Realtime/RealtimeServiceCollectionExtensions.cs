using System;
using System.IO;
using System.Reflection;
using Jering.Javascript.NodeJS;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SIL.XForge.Configuration;
using SIL.XForge.Realtime;

namespace Microsoft.Extensions.DependencyInjection
{
    public static class RealtimeServiceCollectionExtensions
    {
        public static IServiceCollection AddRealtimeServer(
            this IServiceCollection services,
            ILoggerFactory loggerFactory,
            IConfiguration configuration,
            Action<RealtimeOptions> configureOptions,
            bool launchWithDebugging = false
        )
        {
            services.AddNodeJS();
            services.Configure<NodeJSProcessOptions>(options =>
            {
                options.ProjectPath = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
                if (launchWithDebugging)
                {
                    options.NodeAndV8Options = "--inspect=9230";
                }
            });
            if (launchWithDebugging)
            {
                services.Configure<OutOfProcessNodeJSServiceOptions>(options => options.TimeoutMS = -1);
            }
            services.AddSingleton<IJsonService, RealtimeJsonService>();

            services.Configure(configureOptions);
            services.AddSingleton<IRealtimeServer, RealtimeServer>();
            services.AddSingleton<IRealtimeService, RealtimeService>();
            return services;
        }
    }
}
