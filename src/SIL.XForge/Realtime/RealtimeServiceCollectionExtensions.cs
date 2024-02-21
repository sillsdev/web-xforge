using System;
using System.IO;
using System.Reflection;
using Jering.Javascript.NodeJS;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SIL.XForge.Configuration;
using SIL.XForge.Realtime;

namespace Microsoft.Extensions.DependencyInjection;

public static class RealtimeServiceCollectionExtensions
{
    public static IServiceCollection AddRealtimeServer(
        this IServiceCollection services,
        ILoggerFactory loggerFactory,
        IConfiguration configuration,
        Action<RealtimeOptions> configureOptions,
        string? nodeOptions = null,
        bool useExistingRealtimeServer = false
    )
    {
        services.AddNodeJS();
        services.Configure<NodeJSProcessOptions>(options =>
        {
            // Specify the port so NodeJS can be shared with other processes
            options.Port = 5002;
            options.ProjectPath = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location) ?? string.Empty;
            if (!string.IsNullOrWhiteSpace(nodeOptions))
            {
                options.NodeAndV8Options = nodeOptions;
            }
        });

        // If we are using another NodeJS process, be sure to use our factory implementation
        if (useExistingRealtimeServer)
        {
            services.AddSingleton<INodeJSProcessFactory, ExistingNodeJSProcessFactory>();
        }

        // Disable invocation timeout so the debugger can be paused
        if (nodeOptions?.Contains("--inspect", StringComparison.OrdinalIgnoreCase) == true)
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
