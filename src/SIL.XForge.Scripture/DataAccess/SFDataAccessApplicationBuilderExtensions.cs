using SIL.XForge.Scripture.Models;

namespace Microsoft.AspNetCore.Builder
{
    public static class SFDataAccessApplicationBuilderExtensions
    {
        public static void UseSFDataAccess(this IApplicationBuilder app)
        {
            app.UseDataAccess();

            app.InitRepository<TranslateMetrics>();
            app.InitRepository<SFProjectSecret>();
        }
    }
}
