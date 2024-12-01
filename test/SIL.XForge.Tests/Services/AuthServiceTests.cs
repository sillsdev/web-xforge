using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using NUnit.Framework;
using SIL.XForge.Configuration;

namespace SIL.XForge.Services;

[TestFixture]
public class AuthServiceTests
{
    public const string ValidPassword = "password";
    public const string ValidUsername = "username";

    [Test]
    public async Task GetParatextTokensAsync_NoParatextIdentity()
    {
        // Set up a mock Auth0 API
        string userResponse = $$"""
            {
                "identities":[
                    {
                       "provider":"google-oauth2",
                       "access_token":"{{MockHttpMessageHandler.GenerateToken()}}",
                       "user_id":"google-user-01",
                       "connection":"google-oauth2",
                       "isSocial":true
                    }
                ]
            }
            """;
        var handler = new MockHttpMessageHandler(
            [
                (
                    url: "oauth/token",
                    message: $$"""{"access_token": "{{MockHttpMessageHandler.GenerateToken()}}"}""",
                    statusCode: HttpStatusCode.OK
                ),
                (url: "users/auth01", message: userResponse, statusCode: HttpStatusCode.OK),
            ]
        );
        var httpClient = handler.CreateHttpClient();

        var env = new TestEnvironment(httpClient);

        // SUT
        var result = await env.Service.GetParatextTokensAsync("auth01", CancellationToken.None);
        Assert.IsNull(result);
        Assert.AreEqual(2, handler.NumberOfCalls);
        Assert.IsNull(handler.LastInput);
    }

    [Test]
    public async Task GetParatextTokensAsync_NotFound()
    {
        // Set up a mock Auth0 API
        var handler = new MockHttpMessageHandler(
            [
                (
                    url: "oauth/token",
                    message: $$"""{"access_token": "{{MockHttpMessageHandler.GenerateToken()}}"}""",
                    statusCode: HttpStatusCode.OK
                ),
                (
                    url: "users/auth01",
                    message: """{"statusCode":404,"error":"Not Found","message":"The user does not exist.","errorCode":"inexistent_user"}""",
                    statusCode: HttpStatusCode.NotFound
                ),
            ]
        );
        var httpClient = handler.CreateHttpClient();

        var env = new TestEnvironment(httpClient);
        env.ExceptionHandler.EnsureSuccessStatusCode(Arg.Is<HttpResponseMessage>(h => !h.IsSuccessStatusCode))
            .Throws(new HttpRequestException(null, null, HttpStatusCode.NotFound));

        // SUT
        var result = await env.Service.GetParatextTokensAsync("auth01", CancellationToken.None);
        Assert.IsNull(result);
        Assert.AreEqual(2, handler.NumberOfCalls);
        Assert.IsNull(handler.LastInput);
    }

    [Test]
    public async Task GetParatextTokensAsync_Success()
    {
        // Set up a mock Auth0 API
        string accessToken = MockHttpMessageHandler.GenerateToken();
        const string refreshToken = "refresh_token_here";
        string userResponse = $$"""
            {
                "identities":[
                    {
                       "provider":"google-oauth2",
                       "access_token":"{{MockHttpMessageHandler.GenerateToken()}}",
                       "user_id":"google-user-01",
                       "connection":"google-oauth2",
                       "isSocial":true
                    },
                    {
                       "provider":"oauth2",
                       "access_token":"{{accessToken}}",
                       "refresh_token":"{{refreshToken}}",
                       "user_id":"paratext-user-01",
                       "connection":"paratext",
                       "isSocial":true
                    },
                ]
            }
            """;
        var handler = new MockHttpMessageHandler(
            [
                (
                    url: "oauth/token",
                    message: $$"""{"access_token": "{{MockHttpMessageHandler.GenerateToken()}}"}""",
                    statusCode: HttpStatusCode.OK
                ),
                (url: "users/auth01", message: userResponse, statusCode: HttpStatusCode.OK),
            ]
        );
        var httpClient = handler.CreateHttpClient();

        var env = new TestEnvironment(httpClient);

        // SUT
        var result = await env.Service.GetParatextTokensAsync("auth01", CancellationToken.None);
        Assert.AreEqual(accessToken, result?.AccessToken);
        Assert.AreEqual(refreshToken, result?.RefreshToken);
        Assert.AreEqual(2, handler.NumberOfCalls);
        Assert.IsNull(handler.LastInput);
    }

    [TestCase(ValidUsername, "invalid_password")]
    [TestCase("invalid_username", ValidPassword)]
    [TestCase("invalid_username", "invalid_password")]
    public void ValidateWebhookCredentials_Failure(string username, string password)
    {
        var env = new TestEnvironment();

        // SUT
        bool actual = env.Service.ValidateWebhookCredentials(username, password);
        Assert.IsFalse(actual);
    }

    [Test]
    public void ValidateWebhookCredentials_Success()
    {
        var env = new TestEnvironment();

        // SUT
        bool actual = env.Service.ValidateWebhookCredentials(ValidUsername, ValidPassword);
        Assert.IsTrue(actual);
    }

    private class TestEnvironment
    {
        public TestEnvironment(HttpClient? httpClient = null)
        {
            httpClient ??= new HttpClient();
            var authOptions = Substitute.For<IOptions<AuthOptions>>();
            authOptions.Value.Returns(
                new AuthOptions
                {
                    BackendClientSecret = "secret",
                    Domain = "localhost",
                    WebhookUsername = ValidUsername,
                    WebhookPassword = ValidPassword,
                }
            );
            ExceptionHandler = Substitute.For<IExceptionHandler>();
            var httpClientFactory = Substitute.For<IHttpClientFactory>();
            httpClientFactory.CreateClient(Arg.Any<string>()).Returns(httpClient);
            Service = new AuthService(authOptions, ExceptionHandler, httpClientFactory);
        }

        public IExceptionHandler ExceptionHandler { get; }
        public AuthService Service { get; }
    }
}
