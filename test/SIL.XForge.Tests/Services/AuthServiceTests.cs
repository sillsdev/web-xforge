using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Configuration;

namespace SIL.XForge.Services;

[TestFixture]
public class AuthServiceTests
{
    [Test]
    public async Task GetParatextTokensAsync_NoParatextIdentity()
    {
        // Set up a mock Auth0 API
        string userResponse = $$"""
        {
            "identities":[
                {
                   "provider":"google-oauth2",
                   "access_token":"{{TestEnvironment.GenerateToken()}}",
                   "user_id":"google-user-01",
                   "connection":"google-oauth2",
                   "isSocial":true
                }
            ]
        }
        """;
        Dictionary<string, string> responses = new Dictionary<string, string>
        {
            { "oauth/token", $$"""{"access_token": "{{TestEnvironment.GenerateToken()}}"}""" },
            { "users/auth01", userResponse },
        };
        var handler = new MockHttpMessageHandler(responses, HttpStatusCode.OK);
        var httpClient = TestEnvironment.CreateHttpClient(handler);

        var env = new TestEnvironment(httpClient);

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
        string accessToken = TestEnvironment.GenerateToken();
        const string refreshToken = "refresh_token_here";
        string userResponse = $$"""
        {
            "identities":[
                {
                   "provider":"google-oauth2",
                   "access_token":"{{TestEnvironment.GenerateToken()}}",
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
        Dictionary<string, string> responses = new Dictionary<string, string>
        {
            { "oauth/token", $$"""{"access_token": "{{TestEnvironment.GenerateToken()}}"}""" },
            { "users/auth01", userResponse },
        };
        var handler = new MockHttpMessageHandler(responses, HttpStatusCode.OK);
        var httpClient = TestEnvironment.CreateHttpClient(handler);

        var env = new TestEnvironment(httpClient);

        // SUT
        var result = await env.Service.GetParatextTokensAsync("auth01", CancellationToken.None);
        Assert.AreEqual(accessToken, result?.AccessToken);
        Assert.AreEqual(refreshToken, result?.RefreshToken);
        Assert.AreEqual(2, handler.NumberOfCalls);
        Assert.IsNull(handler.LastInput);
    }

    private class TestEnvironment
    {
        public TestEnvironment(HttpClient? httpClient = default)
        {
            var authOptions = Substitute.For<IOptions<AuthOptions>>();
            authOptions.Value.Returns(new AuthOptions { Domain = "localhost", BackendClientSecret = "secret" });
            var exceptionHandler = Substitute.For<IExceptionHandler>();
            var httpClientFactory = Substitute.For<IHttpClientFactory>();
            httpClientFactory.CreateClient(Arg.Any<string>()).Returns(httpClient);
            Service = new AuthService(authOptions, exceptionHandler, httpClientFactory);
        }

        public AuthService Service { get; }

        public static HttpClient CreateHttpClient(HttpMessageHandler handler) =>
            new HttpClient(handler) { BaseAddress = new Uri("http://localhost") };

        public static string GenerateToken()
        {
            var tokenHandler = new JwtSecurityTokenHandler();
            SecurityToken token = tokenHandler.CreateToken(
                new SecurityTokenDescriptor { Expires = DateTime.UtcNow.AddDays(1) }
            );
            return tokenHandler.WriteToken(token);
        }
    }
}
