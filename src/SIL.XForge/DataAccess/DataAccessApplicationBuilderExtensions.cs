using Hangfire;
using Microsoft.Extensions.DependencyInjection;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;

namespace Microsoft.AspNetCore.Builder
{
    public static class DataAccessApplicationBuilderExtensions
    {
        public static void UseDataAccess(this IApplicationBuilder app, bool isBeta)
        {
            if (!isBeta)
            {
                app.UseHangfireServer();
                app.UseHangfireDashboard();
            }

            app.InitRepository<UserSecret>();
            app.InitRepository<BetaMigration>();
        }

        public static void InitRepository<T>(this IApplicationBuilder app) where T : IIdentifiable
        {
            app.ApplicationServices.GetService<IRepository<T>>().Init();
        }
    }
}
