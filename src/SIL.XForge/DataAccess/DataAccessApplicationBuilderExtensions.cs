using Microsoft.Extensions.DependencyInjection;
using SIL.XForge.DataAccess;
using SIL.XForge.EventMetrics;
using SIL.XForge.Models;

namespace Microsoft.AspNetCore.Builder;

public static class DataAccessApplicationBuilderExtensions
{
    extension(IApplicationBuilder app)
    {
        public void UseDataAccess()
        {
            app.InitRepository<EventMetric>();
            app.InitRepository<SiteConfig>();
            app.InitRepository<UserSecret>();
        }

        public void InitRepository<T>()
            where T : IIdentifiable => app.ApplicationServices.GetService<IRepository<T>>()?.Init();
    }
}
