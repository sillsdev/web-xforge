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
        private readonly IExceptionHandler _exceptionHandler;

        public AuthService(IOptions<AuthOptions> authOptions, IExceptionHandler exceptionHandler)
        {
            _authOptions = authOptions;
            _exceptionHandler = exceptionHandler;
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

        public Task<string> GetUserAsync(string authId)
        {
            return CallApiAsync(HttpMethod.Get, $"users/{authId}");
        }

        public Task LinkAccounts(string primaryAuthId, string secondaryAuthId)
        {
            var content = new JObject(
                new JProperty("provider", "oauth2"),
                new JProperty("user_id", secondaryAuthId));
            return CallApiAsync(HttpMethod.Post, $"users/{primaryAuthId}/identities", content);
        }

        public Task UpdateInterfaceLanguage(string authId, string language)
        {
            var content = new JObject(
                new JProperty("user_metadata", new JObject(
                    new JProperty("interface_language", language))
                ));
            // Since .NET Std 2.0 see https://stackoverflow.com/a/23600004/5501739
            return CallApiAsync(new HttpMethod("PATCH"), $"users/{authId}", content);
        }

        private async Task<string> CallApiAsync(HttpMethod method, string url, JToken content = null)
        {
            bool refreshed = false;
            while (!refreshed)
            {
                var results = await GetAccessTokenAsync();
                string accessToken = results.AccessToken;
                refreshed = results.Refreshed;

                using (var request = new HttpRequestMessage(method, $"api/v2/{url}"))
                {
                    request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
                    if (content != null)
                        request.Content = new StringContent(content.ToString(), Encoding.UTF8, "application/json");
                    HttpResponseMessage response = await _httpClient.SendAsync(request);
                    if (response.StatusCode != HttpStatusCode.Unauthorized)
                    {
                        await _exceptionHandler.EnsureSuccessStatusCode(response);
                        return await response.Content.ReadAsStringAsync();
                    }
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

                using (var request = new HttpRequestMessage(HttpMethod.Post, "oauth/token"))
                {
                    AuthOptions options = _authOptions.Value;
                    var requestObj = new JObject(
                        new JProperty("grant_type", "client_credentials"),
                        new JProperty("client_id", options.BackendClientId),
                        new JProperty("client_secret", options.BackendClientSecret),
                        new JProperty("audience", _authOptions.Value.ManagementAudience));
                    request.Content = new StringContent(requestObj.ToString(), Encoding.UTF8, "application/json");
                    if (string.IsNullOrEmpty(options.BackendClientSecret))
                    {
                        Console.WriteLine("Note: AuthService is using an empty BackendClientSecret.");
                    }
                    HttpResponseMessage response = await _httpClient.SendAsync(request);
                    await _exceptionHandler.EnsureSuccessStatusCode(response);

                    string responseJson = await response.Content.ReadAsStringAsync();
                    var responseObj = JObject.Parse(responseJson);
                    _accessToken = (string)responseObj["access_token"];
                    return (_accessToken, true);
                }
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
