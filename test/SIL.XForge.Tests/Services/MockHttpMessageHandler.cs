using System;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.IdentityModel.Tokens;

namespace SIL.XForge.Services;

public class MockHttpMessageHandler((string url, string message, HttpStatusCode statusCode)[] responses)
    : HttpMessageHandler
{
    public string? LastInput { get; private set; }
    public int NumberOfCalls { get; private set; }

    public static string GenerateToken(DateTime? issuedAt = null)
    {
        DateTime tokenDate = issuedAt ?? DateTime.UtcNow;
        var tokenHandler = new JwtSecurityTokenHandler();
        SecurityToken token = tokenHandler.CreateToken(
            new SecurityTokenDescriptor { Expires = tokenDate.AddDays(1), IssuedAt = tokenDate }
        );
        return tokenHandler.WriteToken(token);
    }

    public HttpClient CreateHttpClient() => new HttpClient(this) { BaseAddress = new Uri("http://localhost") };

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
