using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;

namespace Microsoft.AspNetCore.Builder;

public static class HostValidationApplicationBuilderExtensions
{
    /// <summary>
    /// Rejects with 400 any request whose host is not in <paramref name="allowedHosts"/>.
    /// </summary>
    /// <remarks>
    /// This must come after <c>UseForwardedHeaders</c>. Unless a reverse proxy preserves the original Host header,
    /// the Host header is the address the proxy connected to (such as localhost:5000), and the host the user requested
    /// is only known once the forwarded headers have been applied. ASP.NET Core's built-in host filtering can't be
    /// used for this, because it is added ahead of the whole pipeline and so sees the proxy's Host header. It is left
    /// allowing any host.
    /// </remarks>
    public static void UseHostValidation(this IApplicationBuilder app, string[] allowedHosts) =>
        app.Use(
            (context, next) =>
            {
                if (allowedHosts.Contains(context.Request.Host.Host, StringComparer.OrdinalIgnoreCase))
                    return next(context);

                context.Response.StatusCode = StatusCodes.Status400BadRequest;
                return Task.CompletedTask;
            }
        );
}
