using System;
using System.Diagnostics;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Security.Claims;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;
using SIL.XForge.Configuration;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Services;

/// <summary> Helper methods to access information involving JWT tokens </summary>
public class JwtTokenHelper(IExceptionHandler exceptionHandler, ILogger<JwtTokenHelper> logger) : IJwtTokenHelper
{
    /// <summary> Get the Paratext username from the access token stored in the UserSecret. </summary>
    public string? GetParatextUsername(UserSecret userSecret)
    {
        if (userSecret == null || userSecret.ParatextTokens == null || userSecret.ParatextTokens.AccessToken == null)
        {
            return null;
        }
        var accessToken = new JwtSecurityToken(userSecret.ParatextTokens.AccessToken);
        Claim usernameClaim = accessToken.Claims.FirstOrDefault(c => c.Type == "username");
        return usernameClaim?.Value;
    }

    /// <summary> Get the JWT token that a REST client can use to authenticate. </summary>
    public string GetJwtTokenFromUserSecret(UserSecret userSecret)
    {
        var jwtToken = userSecret.ParatextTokens.AccessToken;
        if (jwtToken?.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ?? false)
            jwtToken = jwtToken["Bearer ".Length..].Trim();
        return jwtToken;
    }

    /// <summary> Refresh the Paratext access token if expired with the given HttpClient. </summary>
    public async Task<Tokens> RefreshAccessTokenAsync(
        ParatextOptions options,
        Tokens paratextTokens,
        HttpClient client,
        CancellationToken token
    )
    {
        bool expired = !paratextTokens.ValidateLifetime();
        if (!expired)
            return paratextTokens;
        using var request = new HttpRequestMessage(HttpMethod.Post, "api8/token");
        var requestObj = new JObject(
            new JProperty("grant_type", "refresh_token"),
            new JProperty("client_id", options.ClientId),
            new JProperty("client_secret", options.ClientSecret),
            new JProperty("refresh_token", paratextTokens.RefreshToken)
        );
        request.Content = new StringContent(requestObj.ToString(), Encoding.Default, "application/json");
        Stopwatch stopwatch = Stopwatch.StartNew();
        HttpResponseMessage response = await client.SendAsync(request, token);
        stopwatch.Stop();
        DateTime requestTime = DateTime.UtcNow;

        // Rethrow 400 errors as unauthorized, as these are related to invalid or expired tokens
        if (response.StatusCode == HttpStatusCode.BadRequest)
        {
            throw new UnauthorizedAccessException();
        }

        await exceptionHandler.EnsureSuccessStatusCode(response);

        string responseJson = await response.Content.ReadAsStringAsync(token);
        JObject responseObj = JObject.Parse(responseJson);
        Tokens tokens = new Tokens
        {
            AccessToken = (string)responseObj["access_token"],
            RefreshToken = (string)responseObj["refresh_token"]
        };

        // Track the clock drift between the Scripture Forge and the Paratext Registry servers
        if (
            tokens.IssuedAt > requestTime.AddSeconds(15)
            || tokens.IssuedAt < requestTime.Subtract(stopwatch.Elapsed).AddSeconds(-15)
        )
        {
            TimeSpan difference = tokens.IssuedAt - requestTime;
            string drift = @$"{(difference.TotalSeconds > 0 ? "+" : "-")}{difference:hh\:mm\:ss}";
            string message = $"Registry Server Clock Drift: {drift}";
            logger.LogWarning(message);
            exceptionHandler.ReportException(new ArgumentOutOfRangeException(message));
        }

        return tokens;
    }
}
