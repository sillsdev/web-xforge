using Bugsnag.AspNet.Core;
using Microsoft.Extensions.Configuration;
using SIL.XForge;

namespace Microsoft.Extensions.DependencyInjection;

public static class ExceptionHandlerServiceCollectionExtensions
{
    public static IServiceCollection AddExceptionReporting(
        this IServiceCollection services,
        IConfiguration configuration
    )
    {
        services.AddScoped<IExceptionHandler, ExceptionHandler>();
        return services
            .AddBugsnag()
            .Configure<Bugsnag.Configuration>(configuration.GetSection("Bugsnag"))
            .Configure<Bugsnag.Configuration>(config =>
            {
                string location = System.Reflection.Assembly.GetEntryAssembly().Location;
                config.AppVersion = System.Diagnostics.FileVersionInfo.GetVersionInfo(location).ProductVersion;
            });
    }
}
