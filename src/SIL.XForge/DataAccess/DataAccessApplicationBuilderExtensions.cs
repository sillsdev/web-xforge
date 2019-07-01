using Hangfire;
using Microsoft.Extensions.DependencyInjection;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;

namespace Microsoft.AspNetCore.Builder
{
    public static class DataAccessApplicationBuilderExtensions
    {
        public static void UseDataAccess(this IApplicationBuilder app)
        {
            app.UseHangfireServer();
            app.UseHangfireDashboard();

            app.InitRepository<UserEntity>();
        }

        public static void InitRepository<T>(this IApplicationBuilder app) where T : Entity
        {
            app.ApplicationServices.GetService<IRepository<T>>().Init();
        }
    }
}
