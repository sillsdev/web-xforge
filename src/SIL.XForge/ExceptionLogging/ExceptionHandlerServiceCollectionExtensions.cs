using SIL.XForge;
using Bugsnag.AspNet.Core;
using Microsoft.Extensions.Configuration;

namespace Microsoft.Extensions.DependencyInjection
{
    public static class ExceptionHandlerServiceCollectionExtensions
    {
        public static IServiceCollection AddExceptionReporting(this IServiceCollection services, IConfiguration configuration)
        {
            services.AddSingleton(typeof(IExceptionHandler), typeof(ExceptionHandler));
            return services.AddBugsnag()
                .Configure<Bugsnag.Configuration>(configuration.GetSection("Bugsnag"))
                .Configure<Bugsnag.Configuration>(config =>
                {
                    string location = System.Reflection.Assembly.GetEntryAssembly().Location;
                    config.AppVersion = System.Diagnostics.FileVersionInfo.GetVersionInfo(location).ProductVersion;
                });
        }
    }
}
