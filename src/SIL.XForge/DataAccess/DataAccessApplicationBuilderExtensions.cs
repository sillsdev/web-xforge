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

            app.InitRepository<User>();
            app.InitRepository<UserSecret>();
        }

        public static void InitRepository<T>(this IApplicationBuilder app) where T : IEntity
        {
            app.ApplicationServices.GetService<IReadOnlyRepository<T>>().Init();
        }
    }
}
