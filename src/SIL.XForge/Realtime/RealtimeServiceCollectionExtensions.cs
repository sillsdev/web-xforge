using System;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SIL.XForge.Configuration;
using SIL.XForge.Realtime;

namespace Microsoft.Extensions.DependencyInjection
{
    public static class RealtimeServiceCollectionExtensions
    {
        public static IServiceCollection
        AddRealtimeServer(
            this IServiceCollection services,
            ILoggerFactory loggerFactory,
            IConfiguration configuration,
            Action<RealtimeOptions> configureOptions,
            bool launchWithDebugging = false
        )
        {
            services
                .AddNodeServices(options =>
                {
                    options.LaunchWithDebugging = launchWithDebugging;
                    options.DebuggingPort = 9230;
                    options.WatchFileExtensions = new string[0];
                    options.NodeInstanceOutputLogger =
                        new RealtimeServerLogger(loggerFactory.CreateLogger("SIL.XForge.Realtime.RealtimeServer"));
                });

            services.Configure (configureOptions);
            services.AddSingleton<RealtimeServer>();
            services.AddSingleton<IRealtimeService, RealtimeService>();
            return services;
        }
    }
}
