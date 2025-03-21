using System;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
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
using SIL.XForge.Models;

namespace SIL.XForge.Services;

/// <summary>
/// This service provides methods for accessing the Auth0 Management API.
/// </summary>
public class AuthService : DisposableBase, IAuthService
{
    private readonly HttpClient _httpClient;
    private readonly SemaphoreSlim _lock = new SemaphoreSlim(1, 1);
    private string? _accessToken;
    private readonly IOptions<AuthOptions> _authOptions;
    private readonly IExceptionHandler _exceptionHandler;

    public AuthService(
        IOptions<AuthOptions> authOptions,
        IExceptionHandler exceptionHandler,
        IHttpClientFactory httpClientFactory
    )
    {
        _authOptions = authOptions;
        _exceptionHandler = exceptionHandler;
        _httpClient = httpClientFactory.CreateClient();
        _httpClient.BaseAddress = new Uri($"https://{_authOptions.Value.Domain}");
    }

    public bool ValidateWebhookCredentials(string username, string password)
    {
        AuthOptions authOptions = _authOptions.Value;
        return authOptions.WebhookUsername == username && authOptions.WebhookPassword == password;
    }

    public async Task<Tokens?> GetParatextTokensAsync(string authId, CancellationToken token)
    {
        string userProfileJson;
        try
        {
            userProfileJson = await CallApiAsync(HttpMethod.Get, $"users/{authId}", content: null, token);
        }
        catch (HttpRequestException e) when (e.StatusCode == HttpStatusCode.NotFound)
        {
            // The users API returns 404 if the user was removed from Auth0
            return null;
        }

        JObject userProfile = JObject.Parse(userProfileJson);
        JArray identities = userProfile["identities"] as JArray;
        JObject ptIdentity = identities?.OfType<JObject>().FirstOrDefault(i => (string)i["connection"] == "paratext");
        if (ptIdentity is not null)
        {
            return new Tokens
            {
                AccessToken = (string)ptIdentity["access_token"] ?? string.Empty,
                RefreshToken = (string)ptIdentity["refresh_token"] ?? string.Empty,
            };
        }

        return null;
    }

    public Task<string> GetUserAsync(string authId) => CallApiAsync(HttpMethod.Get, $"users/{authId}");

    public Task<string> GenerateAnonymousUser(
        string name,
        TransparentAuthenticationCredentials credentials,
        string language
    )
    {
        var content = new JObject(
            new JProperty("name", name),
            new JProperty("username", credentials.Username),
            new JProperty("email", $"{credentials.Username}@users.noreply.scriptureforge.org"),
            new JProperty("password", credentials.Password),
            new JProperty("connection", "Transparent-Authentication"),
            new JProperty("user_metadata", new JObject(new JProperty("interface_language", language)))
        );
        return CallApiAsync(HttpMethod.Post, "users", content);
    }

    public Task LinkAccounts(string primaryAuthId, string secondaryAuthId)
    {
        var content = new JObject(new JProperty("provider", "oauth2"), new JProperty("user_id", secondaryAuthId));
        return CallApiAsync(HttpMethod.Post, $"users/{primaryAuthId}/identities", content);
    }

    public Task UpdateAvatar(string authId, string url)
    {
        var content = new JObject(new JProperty("user_metadata", new JObject(new JProperty("picture", url))));
        return CallApiAsync(HttpMethod.Patch, $"users/{authId}", content);
    }

    public Task UpdateInterfaceLanguage(string authId, string language)
    {
        var content = new JObject(
            new JProperty("user_metadata", new JObject(new JProperty("interface_language", language)))
        );
        return CallApiAsync(HttpMethod.Patch, $"users/{authId}", content);
    }

    private async Task<string> CallApiAsync(
        HttpMethod method,
        string url,
        JToken? content = null,
        CancellationToken token = default
    )
    {
        bool refreshed = false;
        while (!refreshed)
        {
            (string? accessToken, bool wasRefreshed) = await GetAccessTokenAsync(token);
            refreshed = wasRefreshed;

            using var request = new HttpRequestMessage(method, $"api/v2/{url}");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            if (content != null)
                request.Content = new StringContent(content.ToString(), Encoding.UTF8, "application/json");
            HttpResponseMessage response = await _httpClient.SendAsync(request, token);
            if (response.StatusCode != HttpStatusCode.Unauthorized)
            {
                await _exceptionHandler.EnsureSuccessStatusCode(response);
                return await response.Content.ReadAsStringAsync(token);
            }
        }

        throw new SecurityException("The Auth0 access token is invalid.");
    }

    private async Task<(string AccessToken, bool Refreshed)> GetAccessTokenAsync(CancellationToken token)
    {
        await _lock.WaitAsync(token);
        try
        {
            if (!IsAccessTokenExpired())
                return (_accessToken, false);

            using var request = new HttpRequestMessage(HttpMethod.Post, "oauth/token");
            AuthOptions options = _authOptions.Value;
            var requestObj = new JObject(
                new JProperty("grant_type", "client_credentials"),
                new JProperty("client_id", options.BackendClientId),
                new JProperty("client_secret", options.BackendClientSecret),
                new JProperty("audience", _authOptions.Value.ManagementAudience)
            );
            request.Content = new StringContent(requestObj.ToString(), Encoding.UTF8, "application/json");
            if (string.IsNullOrEmpty(options.BackendClientSecret))
            {
                Console.WriteLine("Note: AuthService is using an empty BackendClientSecret.");
            }
            HttpResponseMessage response = await _httpClient.SendAsync(request, token);
            await _exceptionHandler.EnsureSuccessStatusCode(response);

            string responseJson = await response.Content.ReadAsStringAsync(token);
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

    protected override void DisposeManagedResources() => _httpClient.Dispose();
}
