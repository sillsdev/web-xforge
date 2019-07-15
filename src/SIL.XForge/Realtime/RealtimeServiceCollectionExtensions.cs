using System;
using Microsoft.Extensions.Configuration;
using SIL.XForge.Configuration;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Utils;

namespace Microsoft.Extensions.DependencyInjection
{
    public static class RealtimeServiceCollectionExtensions
    {
        public static IServiceCollection AddRealtimeServer(this IServiceCollection services,
            IConfiguration configuration, Action<RealtimeOptions> configureOptions, bool launchWithDebugging = false)
        {
            services.AddNodeServices(options =>
            {
                options.LaunchWithDebugging = launchWithDebugging;
                options.WatchFileExtensions = new string[0];
            });

            var siteOptions = configuration.GetOptions<SiteOptions>();
            services.Configure<RealtimeOptions>(options =>
            {
                options.UserDoc.ImmutableProperties.Add(
                    ObjectPath<User>.Create(u => u.Sites[siteOptions.Id].LastLogin));
            });
            services.Configure(configureOptions);
            services.AddSingleton<IRealtimeService, RealtimeService>();
            return services;
        }
    }
}
