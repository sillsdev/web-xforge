using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace SIL.XForge.Services;

public class MockHttpMessageHandler((string url, string message, HttpStatusCode statusCode)[] responses)
    : HttpMessageHandler
{
    public string? LastInput { get; private set; }
    public int NumberOfCalls { get; private set; }

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken
    )
    {
        NumberOfCalls++;
        LastInput = request.Content is not null ? await request.Content.ReadAsStringAsync(cancellationToken) : null;

        foreach (
            (string _, string message, HttpStatusCode statusCode) in responses.Where(response =>
                request.RequestUri!.PathAndQuery.Contains(response.url)
            )
        )
        {
            return new HttpResponseMessage
            {
                StatusCode = statusCode,
                Content = new StringContent(message),
                RequestMessage = request,
            };
        }

        throw new ArgumentOutOfRangeException(nameof(request));
    }
}
