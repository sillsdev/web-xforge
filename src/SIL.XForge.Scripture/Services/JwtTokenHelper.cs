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
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Services;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Services
{
    /// <summary> Helper methods to access information involving JWT tokens </summary>
    public class JwtTokenHelper : IJwtTokenHelper
    {
        private readonly IExceptionHandler _exceptionHandler;
        private readonly IRepository<UserSecret> _userSecrets;

        /// <summary> Map user IDs to semaphores </summary>
        private readonly ConcurrentDictionary<string, SemaphoreSlim> _tokenRefreshSemaphores = new ConcurrentDictionary<string, SemaphoreSlim>();
        public JwtTokenHelper(IExceptionHandler exceptionHandler, IRepository<UserSecret> userSecrets)
        {
            _exceptionHandler = exceptionHandler;
            _userSecrets = userSecrets;
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

        /// <summary>
        /// Gets an up-to-date (valid, refreshed if needed) Paratext access token. Uses the given HttpClient if a
        /// refresh is necessary. Attempts to ensure that making multiple concurrent calls to this method does not
        /// cause multiple token refresh attempts for a given user.
        /// </summary>
        public async Task<Tokens> GetValidAccessTokenAsync(ParatextOptions options, UserSecret initialUserSecret,
            HttpClient client)
        {
            if (initialUserSecret.ParatextTokens.ValidateLifetime())
            {
                return initialUserSecret.ParatextTokens;
            }

            string userId = initialUserSecret.Id;
            SemaphoreSlim semaphore = _tokenRefreshSemaphores.GetOrAdd(userId, (string key) => new SemaphoreSlim(1, 1));

            await semaphore.WaitAsync();

            try
            {
                UserSecret updatedSecretFromDB = await GetLatestUserSecretFromDBAsync(userId);
                if (updatedSecretFromDB.ParatextTokens.ValidateLifetime())
                {
                    return updatedSecretFromDB.ParatextTokens;
                }
                Tokens refreshedUserTokens = await RequestNewTokenAsync(options, initialUserSecret, client);
                await _userSecrets.UpdateAsync(userId, b => b.Set(u => u.ParatextTokens, refreshedUserTokens));
                return refreshedUserTokens;
            }
            finally
            {
                semaphore.Release();
            }
        }

        private async Task<UserSecret> GetLatestUserSecretFromDBAsync(string userId)
        {
            Attempt<UserSecret> attempt = await _userSecrets.TryGetAsync(userId);
            if (!attempt.TryResult(out UserSecret userSecret))
            {
                throw new DataNotFoundException("Could not find user secrets");
            }
            return userSecret;
        }

        private async Task<Tokens> RequestNewTokenAsync(ParatextOptions options, UserSecret userSecret, HttpClient client)
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
        }
    }
}
