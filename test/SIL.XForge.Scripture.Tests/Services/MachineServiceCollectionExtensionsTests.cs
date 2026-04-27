using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Duende.AccessTokenManagement;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Integration tests that verify the Serval HTTP client pipeline does not make unnecessary extra requests to Serval
/// when it returns 401. The underlying cause is that Duende.AccessTokenManagement v4's
/// <c>AddClientCredentialsHttpClient</c> automatically adds <c>AddDefaultAccessTokenResiliency()</c>, which retries on
/// 401 with <c>ForceTokenRenewal=true</c>. Every such retry is an unnecessary extra request to Serval and can cause
/// an extra M2M token request to Auth0 (especially when many concurrent requests encounter 401 or when the cached
/// token has already expired).
///
/// The fix: use <c>AddHttpClient + AddClientCredentialsTokenHandler</c> instead of
/// <c>AddClientCredentialsHttpClient</c>, so that the automatic resilience handler is NOT added. 401 responses from
/// Serval are then propagated directly to callers without extra requests or force-renewals.
///
/// These tests are GREEN with the fix and would be RED without it:
/// <list type="bullet">
///   <item><see cref="AddSFMachine_WhenServalReturns401_ServalRequestedOnce" /></item>
/// </list>
/// </summary>
[TestFixture]
public class MachineServiceCollectionExtensionsTests
{
    // Fake configuration values used to satisfy AddClientCredentialsTokenManagement validation.
    private const string FakeTokenUrl = "https://fake-auth0.test/oauth/token";
    private const string FakeApiServer = "https://fake-serval.test/";
    private const string FakeClientId = "fake-client-id";
    private const string FakeClientSecret = "fake-client-secret";
    private const string FakeAudience = "fake-audience";

    /// <summary>
    /// A minimal JSON OAuth2 token response that satisfies the Duende AccessTokenManagement parser.
    /// </summary>
    private static readonly string FakeTokenResponseJson =
        """{"access_token":"fake-token","token_type":"Bearer","expires_in":3600}""";

    [Test]
    public async Task AddSFMachine_WhenServalReturns401_ServalRequestedOnce()
    {
        // This test is GREEN with the fix (AddHttpClient + AddClientCredentialsTokenHandler, no
        // AddDefaultAccessTokenResiliency) and would be RED without it (AddClientCredentialsHttpClient
        // automatically adds AddDefaultAccessTokenResiliency, which retries 401 responses — causing Serval to be
        // contacted a second time and triggering a token force-renewal attempt with each retry).
        var env = new TestEnvironment(servalStatusCode: HttpStatusCode.Unauthorized);

        // SUT: make a Serval request that returns 401.
        var response = await env.ServalClient.GetAsync(FakeApiServer + "api/test");

        Assert.AreEqual(HttpStatusCode.Unauthorized, response.StatusCode);
        // Serval should be contacted only once. The automatic Duende resilience handler would have retried the
        // request a second time, contacting Serval twice and forcing an unnecessary token renewal attempt.
        Assert.AreEqual(1, env.ServalRequestCount);
    }

    [Test]
    public async Task AddSFMachine_WhenServalReturns200_ServalRequestedOnce()
    {
        var env = new TestEnvironment(servalStatusCode: HttpStatusCode.OK);

        // SUT: make a Serval request that returns 200.
        var response = await env.ServalClient.GetAsync(FakeApiServer + "api/test");

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        Assert.AreEqual(1, env.ServalRequestCount);
    }

    [Test]
    public async Task AddSFMachine_WhenServalReturns401_Auth0RequestedOnce()
    {
        // Regardless of whether Serval returns 401 or 200, Auth0 should only be contacted once for the initial
        // token fetch. The M2MTokenRequestCounter tracks back-channel calls to Auth0.
        var env = new TestEnvironment(servalStatusCode: HttpStatusCode.Unauthorized);

        // SUT
        await env.ServalClient.GetAsync(FakeApiServer + "api/test");

        Assert.AreEqual(1, env.M2MTokenRequestCounter.Count);
    }

    [Test]
    public async Task AddSFMachine_WhenServalReturns200_Auth0RequestedOnce()
    {
        var env = new TestEnvironment(servalStatusCode: HttpStatusCode.OK);

        // SUT
        await env.ServalClient.GetAsync(FakeApiServer + "api/test");

        Assert.AreEqual(1, env.M2MTokenRequestCounter.Count);
    }

    /// <summary>
    /// Builds the service collection using the production <see cref="MachineServiceCollectionExtensions.AddSFMachine"/>
    /// registration with fake HTTP handlers, so tests run without real network access.
    /// </summary>
    private class TestEnvironment
    {
        private readonly int[] _servalRequestCount = [0];

        public TestEnvironment(HttpStatusCode servalStatusCode = HttpStatusCode.OK)
        {
            var services = new ServiceCollection();
            services.AddLogging();

            var configuration = new ConfigurationBuilder()
                .AddInMemoryCollection(
                    new Dictionary<string, string?>
                    {
                        ["Serval:ApiServer"] = FakeApiServer,
                        ["Serval:TokenUrl"] = FakeTokenUrl,
                        ["Serval:ClientId"] = FakeClientId,
                        ["Serval:ClientSecret"] = FakeClientSecret,
                        ["Serval:Audience"] = FakeAudience,
                        ["Serval:WebhookSecret"] = "fake-webhook-secret",
                    }
                )
                .Build();

            var env = Substitute.For<IWebHostEnvironment>();
            env.EnvironmentName.Returns(Environments.Production);

            // The production code: registers the Serval HTTP client using AddHttpClient +
            // AddClientCredentialsTokenHandler (after the fix) and the M2M counter.
            services.AddSFMachine(configuration, env);

            // Replace the Duende back-channel (Auth0) primary handler with a fake that returns a valid token
            // response without making real network calls. The M2MTokenRequestBackChannelHandler delegating handler
            // added by AddSFMachine is still in the chain and will increment the counter.
            services
                .AddHttpClient(ClientCredentialsTokenManagementDefaults.BackChannelHttpClientName)
                .ConfigurePrimaryHttpMessageHandler(() => new FakeAuth0TokenEndpointHandler());

            // Replace the Serval HTTP client primary handler with a fake that returns the specified status code
            // and counts how many times Serval was contacted.
            int[] servalRequestCount = _servalRequestCount;
            services
                .AddHttpClient(MachineApi.HttpClientName)
                .ConfigurePrimaryHttpMessageHandler(() =>
                    new CountingFakeServalApiHandler(servalStatusCode, servalRequestCount)
                );

            var sp = services.BuildServiceProvider();
            M2MTokenRequestCounter = sp.GetRequiredService<IM2MTokenRequestCounter>();
            ServalClient = sp.GetRequiredService<IHttpClientFactory>().CreateClient(MachineApi.HttpClientName);
        }

        public IM2MTokenRequestCounter M2MTokenRequestCounter { get; }
        public HttpClient ServalClient { get; }

        /// <summary>How many HTTP requests reached the fake Serval primary handler.</summary>
        public int ServalRequestCount => _servalRequestCount[0];
    }

    /// <summary>
    /// Fake primary handler for the Duende back-channel client that returns a valid OAuth token without calling Auth0.
    /// </summary>
    private class FakeAuth0TokenEndpointHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            Task.FromResult(
                new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(FakeTokenResponseJson, Encoding.UTF8, "application/json"),
                }
            );
    }

    /// <summary>
    /// Fake primary handler for the Serval API client that returns a specified status code and counts how many times
    /// it is called.
    /// </summary>
    private class CountingFakeServalApiHandler(HttpStatusCode statusCode, int[] callCount) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Interlocked.Increment(ref callCount[0]);
            return Task.FromResult(new HttpResponseMessage(statusCode));
        }
    }
}
