using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace SIL.XForge.Services;

public class MockHttpMessageHandler(Dictionary<string, string> responses, HttpStatusCode statusCode)
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
            KeyValuePair<string, string> response in responses.Where(
                response => request.RequestUri!.PathAndQuery.Contains(response.Key)
            )
        )
        {
            return new HttpResponseMessage
            {
                StatusCode = statusCode,
                Content = new StringContent(response.Value),
                RequestMessage = request,
            };
        }

        throw new ArgumentOutOfRangeException(nameof(request));
    }
}
