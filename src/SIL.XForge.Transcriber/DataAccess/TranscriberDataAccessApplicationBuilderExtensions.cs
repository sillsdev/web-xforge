using SIL.XForge.Transcriber.Models;

namespace Microsoft.AspNetCore.Builder
{
    public static class TranscriberDataAccessApplicationBuilderExtensions
    {
        public static void UseTranscriberDataAccess(this IApplicationBuilder app)
        {
            app.UseDataAccess();

            app.InitRepository<TranscriberProjectEntity>();
        }
    }
}
