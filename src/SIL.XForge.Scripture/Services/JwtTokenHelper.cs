#nullable disable warnings
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
using Newtonsoft.Json;
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

    /// <summary>
    /// Refreshes an expired Paratext access token using the configured refresh token and returns the updated tokens.
    /// </summary>
    /// <remarks>The request is sent to the Paratext registry with grant_type=refresh_token, and server clock
    /// drift is checked against the local time after a successful response. Warning-level diagnostics are recorded when
    /// the issued timestamp differs significantly from the expected range.</remarks>
    /// <param name="options">The Paratext client configuration used to authenticate the refresh request.</param>
    /// <param name="paratextTokens">
    /// The current Paratext tokens, including the refresh token and lifetime metadata.
    /// </param>
    /// <param name="client">The HTTP client used to send the token refresh request to the Paratext Registry.</param>
    /// <param name="token">The cancellation token used to cancel the refresh request.</param>
    /// <returns>
    /// The current tokens when they are still valid; otherwise the refreshed tokens returned by the Paratext registry.
    /// </returns>
    /// <exception cref="ParatextTokenExpiredException">
    /// Thrown when the refresh request fails because the refresh token is invalid or expired.
    /// </exception>
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
            string errorJson = await response.Content.ReadAsStringAsync(token);
            try
            {
                // Attempt to retrive the error description from the response
                JObject errorDetails = JObject.Parse(errorJson);
                string? errorDescription = (string?)errorDetails["error_description"];
                throw new ParatextTokenExpiredException(errorDescription);
            }
            catch (JsonReaderException)
            {
                // If there is a problem parsing the JSON, just throw the excpetion with the default message
                throw new ParatextTokenExpiredException();
            }
        }

        await exceptionHandler.EnsureSuccessStatusCode(response);

        string responseJson = await response.Content.ReadAsStringAsync(token);
        JObject responseObj = JObject.Parse(responseJson);
        Tokens tokens = new Tokens
        {
            AccessToken = (string)responseObj["access_token"],
            RefreshToken = (string)responseObj["refresh_token"],
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
