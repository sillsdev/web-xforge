using Microsoft.AspNetCore.Http;

namespace Microsoft.AspNetCore.Builder
{
    public static class PingApplicationBuilderExtensions
    {
        public static void UsePing(this IApplicationBuilder app)
        {
            app.Map("/ping", ping => ping.Run(async context => await context.Response.WriteAsync("ok")));
        }
    }
}
