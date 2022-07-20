using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Headers;
using Microsoft.Net.Http.Headers;

namespace Microsoft.AspNetCore.Builder
{
    public static class PingApplicationBuilderExtensions
    {
        public static void UsePing(this IApplicationBuilder app)
        {
            app.Map(
                "/ping",
                ping =>
                    ping.Run(async context =>
                    {
                        ResponseHeaders headers = context.Response.GetTypedHeaders();
                        headers.CacheControl = new CacheControlHeaderValue
                        {
                            NoCache = true,
                            NoStore = true,
                            MustRevalidate = true
                        };
                        headers.Set(HeaderNames.Pragma, "no-cache");
                        headers.Set(HeaderNames.Expires, "0");
                        await context.Response.WriteAsync("ok");
                    })
            );
        }
    }
}
