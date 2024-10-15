using System;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using NUnit.Framework;
using SIL.XForge.Configuration;
using SIL.XForge.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class JwtTokenHelperTests
{
    [Test]
    public void RefreshAccessTokenAsync_BadRequest()
    {
        var env = new TestEnvironment();

        // Mock the Registry Server response
        var handler = new MockHttpMessageHandler(
            [
                (
                    url: "api8/token",
                    message: string.Empty,
                    statusCode: HttpStatusCode.BadRequest,
                    utcDate: DateTime.UtcNow
                ),
            ]
        );
        HttpClient httpClient = TestEnvironment.CreateHttpClient(handler);

        // SUT
        Assert.ThrowsAsync<UnauthorizedAccessException>(
            () =>
                env.Service.RefreshAccessTokenAsync(
                    new ParatextOptions(),
                    new Tokens(),
                    httpClient,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public async Task RefreshAccessTokenAsync_RegistryServerPositiveClockDrift()
    {
        var env = new TestEnvironment();

        // Mock the Registry Server response
        const string accessToken = "123";
        const string refreshToken = "456";
        var handler = new MockHttpMessageHandler(
            [
                (
                    url: "api8/token",
                    message: $$"""{"access_token": "{{accessToken}}", "refresh_token": "{{refreshToken}}"}""",
                    statusCode: HttpStatusCode.OK,
                    utcDate: DateTime.UtcNow.AddSeconds(35)
                ),
            ]
        );
        HttpClient httpClient = TestEnvironment.CreateHttpClient(handler);

        // SUT
        Tokens actual = await env.Service.RefreshAccessTokenAsync(
            new ParatextOptions(),
            new Tokens(),
            httpClient,
            CancellationToken.None
        );

        Assert.AreEqual(accessToken, actual.AccessToken);
        Assert.AreEqual(refreshToken, actual.RefreshToken);
        env.MockLogger.AssertHasEvent(e => e.Message!.Contains("Registry") && e.Message!.Contains('+'));
        env.ExceptionHandler.Received().ReportException(Arg.Any<Exception>());
    }

    [Test]
    public async Task RefreshAccessTokenAsync_RegistryServerNegativeClockDrift()
    {
        var env = new TestEnvironment();

        // Mock the Registry Server response
        const string accessToken = "123";
        const string refreshToken = "456";
        var handler = new MockHttpMessageHandler(
            [
                (
                    url: "api8/token",
                    message: $$"""{"access_token": "{{accessToken}}", "refresh_token": "{{refreshToken}}"}""",
                    statusCode: HttpStatusCode.OK,
                    utcDate: DateTime.UtcNow.AddSeconds(-35)
                ),
            ]
        );
        HttpClient httpClient = TestEnvironment.CreateHttpClient(handler);

        // SUT
        Tokens actual = await env.Service.RefreshAccessTokenAsync(
            new ParatextOptions(),
            new Tokens(),
            httpClient,
            CancellationToken.None
        );

        Assert.AreEqual(accessToken, actual.AccessToken);
        Assert.AreEqual(refreshToken, actual.RefreshToken);
        env.MockLogger.AssertHasEvent(e => e.Message!.Contains("Registry") && e.Message!.Contains('-'));
        env.ExceptionHandler.Received().ReportException(Arg.Any<Exception>());
    }

    [Test]
    public void RefreshAccessTokenAsync_ServerError()
    {
        var env = new TestEnvironment();

        // Mock the Registry Server response
        var handler = new MockHttpMessageHandler(
            [
                (
                    url: "api8/token",
                    message: string.Empty,
                    statusCode: HttpStatusCode.InternalServerError,
                    utcDate: DateTime.UtcNow
                ),
            ]
        );
        HttpClient httpClient = TestEnvironment.CreateHttpClient(handler);

        // SUT
        Assert.ThrowsAsync<HttpRequestException>(
            () =>
                env.Service.RefreshAccessTokenAsync(
                    new ParatextOptions(),
                    new Tokens(),
                    httpClient,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public async Task RefreshAccessTokenAsync_Success()
    {
        var env = new TestEnvironment();

        // Mock the Registry Server response
        const string accessToken = "123";
        const string refreshToken = "456";
        var handler = new MockHttpMessageHandler(
            [
                (
                    url: "api8/token",
                    message: $$"""{"access_token": "{{accessToken}}", "refresh_token": "{{refreshToken}}"}""",
                    statusCode: HttpStatusCode.OK,
                    utcDate: DateTime.UtcNow
                ),
            ]
        );
        HttpClient httpClient = TestEnvironment.CreateHttpClient(handler);

        // SUT
        Tokens actual = await env.Service.RefreshAccessTokenAsync(
            new ParatextOptions(),
            new Tokens(),
            httpClient,
            CancellationToken.None
        );

        Assert.AreEqual(accessToken, actual.AccessToken);
        Assert.AreEqual(refreshToken, actual.RefreshToken);
        env.MockLogger.AssertHasEvent(e => e.Message!.Contains("Registry"));
        env.ExceptionHandler.DidNotReceive().ReportException(Arg.Any<Exception>());
    }

    private class TestEnvironment
    {
        public TestEnvironment()
        {
            ExceptionHandler = Substitute.For<IExceptionHandler>();
            ExceptionHandler
                .EnsureSuccessStatusCode(Arg.Is<HttpResponseMessage>(h => !h.IsSuccessStatusCode))
                .Throws(new HttpRequestException(null, null, HttpStatusCode.NotFound));
            MockLogger = new MockLogger<JwtTokenHelper>();
            Service = new JwtTokenHelper(ExceptionHandler, MockLogger);
        }

        public IExceptionHandler ExceptionHandler { get; }
        public MockLogger<JwtTokenHelper> MockLogger { get; }
        public JwtTokenHelper Service { get; }

        public static HttpClient CreateHttpClient(HttpMessageHandler handler) =>
            new HttpClient(handler) { BaseAddress = new Uri("http://localhost") };
    }
}
