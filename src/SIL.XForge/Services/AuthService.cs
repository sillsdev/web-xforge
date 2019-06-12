using System;
using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using Newtonsoft.Json.Linq;
using SIL.ObjectModel;
using SIL.XForge.Configuration;

namespace SIL.XForge.Services
{
    /// <summary>
    /// This service provides methods for accessing the Auth0 Management API.
    /// </summary>
    public class AuthService : DisposableBase, IAuthService
    {
        private readonly HttpClient _httpClient;
        private readonly SemaphoreSlim _lock = new SemaphoreSlim(1, 1);
        private string _accessToken;
        private readonly IOptions<AuthOptions> _authOptions;

        public AuthService(IOptions<AuthOptions> authOptions)
        {
            _authOptions = authOptions;
            _httpClient = new HttpClient
            {
                BaseAddress = new Uri($"https://{_authOptions.Value.Domain}")
            };
        }

        public bool ValidateWebhookCredentials(string username, string password)
        {
            AuthOptions authOptions = _authOptions.Value;
            return authOptions.WebhookUsername == username && authOptions.WebhookPassword == password;
        }

        public async Task<JObject> GetUserAsync(string authId)
        {
            string content = await CallApiAsync(HttpMethod.Get, $"users/{authId}");
            return JObject.Parse(content);
        }

        public Task LinkAccounts(string primaryAuthId, string secondaryAuthId)
        {
            var content = new JObject(
                new JProperty("provider", "oauth2"),
                new JProperty("user_id", secondaryAuthId));
            return CallApiAsync(HttpMethod.Post, $"users/{primaryAuthId}/identities", content);
        }

        private async Task<string> CallApiAsync(HttpMethod method, string url, JToken content = null)
        {
            bool refreshed = false;
            while (!refreshed)
            {
                var results = await GetAccessTokenAsync();
                string accessToken = results.AccessToken;
                refreshed = results.Refreshed;

                var request = new HttpRequestMessage(method, $"api/v2/{url}");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
                if (content != null)
                    request.Content = new StringContent(content.ToString(), Encoding.UTF8, "application/json");
                HttpResponseMessage response = await _httpClient.SendAsync(request);
                if (response.IsSuccessStatusCode)
                {
                    return await response.Content.ReadAsStringAsync();
                }
                else if (response.StatusCode != HttpStatusCode.Unauthorized)
                {
                    string error = await response.Content.ReadAsStringAsync();
                    throw new HttpRequestException(
                        $"HTTP Request error, Code: {response.StatusCode}, Content: {error}");
                }
            }

            throw new SecurityException("The Auth0 access token is invalid.");
        }

        private async Task<(string AccessToken, bool Refreshed)> GetAccessTokenAsync()
        {
            await _lock.WaitAsync();
            try
            {
                if (!IsAccessTokenExpired())
                    return (_accessToken, false);
                var request = new HttpRequestMessage(HttpMethod.Post, "oauth/token");

                AuthOptions options = _authOptions.Value;
                var requestObj = new JObject(
                    new JProperty("grant_type", "client_credentials"),
                    new JProperty("client_id", options.BackendClientId),
                    new JProperty("client_secret", options.BackendClientSecret),
                    new JProperty("audience", $"https://{_authOptions.Value.Domain}/api/v2/"));
                request.Content = new StringContent(requestObj.ToString(), Encoding.UTF8, "application/json");
                HttpResponseMessage response = await _httpClient.SendAsync(request);
                response.EnsureSuccessStatusCode();

                string responseJson = await response.Content.ReadAsStringAsync();
                var responseObj = JObject.Parse(responseJson);
                _accessToken = (string)responseObj["access_token"];
                return (_accessToken, true);
            }
            finally
            {
                _lock.Release();
            }
        }

        private bool IsAccessTokenExpired()
        {
            if (_accessToken == null)
                return true;
            var accessToken = new JwtSecurityToken(_accessToken);
            var now = DateTime.UtcNow;
            return now < accessToken.ValidFrom || now > accessToken.ValidTo;
        }

        protected override void DisposeManagedResources()
        {
            _httpClient.Dispose();
        }
    }
}
