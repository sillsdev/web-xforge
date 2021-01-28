using System;
using System.Collections.Concurrent;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Net.Http;
using System.Security.Claims;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using SIL.XForge.Configuration;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Services
{
    /// <summary> Helper methods to access information involving JWT tokens </summary>
    public class JwtTokenHelper : IJwtTokenHelper
    {
        private readonly IExceptionHandler _exceptionHandler;

        private readonly SemaphoreSlim _semaphore = new SemaphoreSlim(1, 1);
        private readonly ConcurrentDictionary<string, Task<Tokens>> _userRefreshTasks = new ConcurrentDictionary<string, Task<Tokens>>();

        public JwtTokenHelper(IExceptionHandler exceptionHandler)
        {
            _exceptionHandler = exceptionHandler;
        }

        /// <summary> Get the Paratext username from the access token stored in the UserSecret. </summary>
        public string GetParatextUsername(UserSecret userSecret)
        {
            if (userSecret.ParatextTokens == null || userSecret.ParatextTokens.AccessToken == null)
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
                jwtToken = jwtToken.Substring("Bearer ".Length).Trim();
            return jwtToken;
        }

        /// <summary> Refresh the Paratext access token if expired with the given HttpClient. </summary>
        public async Task<Tokens> RefreshAccessTokenAsync(ParatextOptions options, UserSecret userSecret,
            HttpClient client)
        {
            if (userSecret.ParatextTokens.ValidateLifetime())
            {
                return userSecret.ParatextTokens;
            }

            Task<Tokens> task;
            // Ensure only one refresh occurs for a given user at a time
            await this._semaphore.WaitAsync();

            try
            {
                if (!this._userRefreshTasks.TryGetValue(userSecret.Id, out task))
                {
                    task = Task.Run(async () =>
                    {
                        using (var request = new HttpRequestMessage(HttpMethod.Post, "api8/token"))
                        {
                            var requestObj = new JObject(
                                new JProperty("grant_type", "refresh_token"),
                                new JProperty("client_id", options.ClientId),
                                new JProperty("client_secret", options.ClientSecret),
                                new JProperty("refresh_token", userSecret.ParatextTokens.RefreshToken));
                            request.Content = new StringContent(requestObj.ToString(), Encoding.Default, "application/json");
                            HttpResponseMessage response = await client.SendAsync(request);
                            await _exceptionHandler.EnsureSuccessStatusCode(response);

                            string responseJson = await response.Content.ReadAsStringAsync();
                            JObject responseObj = JObject.Parse(responseJson);
                            return new Tokens
                            {
                                AccessToken = (string)responseObj["access_token"],
                                RefreshToken = (string)responseObj["refresh_token"]
                            };
                        }
                    });
                    this._userRefreshTasks.TryAdd(userSecret.Id, task);
                }
            }
            finally
            {
                this._semaphore.Release();
            }
            Tokens tokens = await task;
            this._userRefreshTasks.TryRemove(userSecret.Id, out _);
            return tokens;
        }
    }
}
