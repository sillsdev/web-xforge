using SIL.XForge.Scripture.Models;

namespace Microsoft.AspNetCore.Builder
{
    public static class SFDataAccessApplicationBuilderExtensions
    {
        public static void UseSFDataAccess(this IApplicationBuilder app, bool isBeta)
        {
            app.UseDataAccess(isBeta);

            app.InitRepository<TranslateMetrics>();
            app.InitRepository<SFProjectSecret>();
        }
    }
}
