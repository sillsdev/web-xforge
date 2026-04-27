using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// A delegating handler that counts and logs every HTTP request made to the Auth0 token endpoint via the Duende
/// AccessTokenManagement back-channel HTTP client.
/// </summary>
/// <remarks>
/// This handler is placed on the back-channel HTTP client so that every real call to Auth0 is visible in logs and
/// countable via <see cref="IM2MTokenRequestCounter" />. This allows developers to verify locally that a change in
/// behavior (e.g., removing auto-resilience that force-renews tokens on 401) actually reduces the number of Auth0
/// token requests.
/// </remarks>
internal class M2MTokenRequestBackChannelHandler(
    IM2MTokenRequestCounter counter,
    ILogger<M2MTokenRequestBackChannelHandler> logger
) : DelegatingHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        counter.Increment();
        logger.LogInformation(
            "M2M access token requested from Auth0 token endpoint (total requests this session: {Count})",
            counter.Count
        );
        return base.SendAsync(request, ct);
    }
}
