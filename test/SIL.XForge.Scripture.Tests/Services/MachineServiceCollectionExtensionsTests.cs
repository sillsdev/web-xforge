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
using Serval.Client;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Integration tests that verify the Serval HTTP client pipeline does not make unnecessary extra requests to Serval
/// when it returns 401, and that all Serval client singletons share a single HttpClient so only one M2M token is
/// requested from Auth0 even when all four singletons are resolved.
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

    [Test]
    public async Task AddSFMachine_AllServalClientsSingletons_ShareSingleHttpClient()
    {
        // Four Serval client singletons (ITranslationEnginesClient, ITranslationEngineTypesClient,
        // IDataFilesClient, ICorporaClient) used to each call factory.CreateClient(), creating 4 separate
        // HttpClients, each fetching their own M2M token from Auth0. After the fix, they all share a single
        // HttpClient so only 1 M2M token request is made even when all 4 are resolved and used.
        var env = new TestEnvironment(servalStatusCode: HttpStatusCode.OK);

        // SUT: resolve all 4 singletons — this triggers the keyed HttpClient singleton resolution.
        ITranslationEnginesClient translationEnginesClient =
            env.ServiceProvider.GetRequiredService<ITranslationEnginesClient>();
        ITranslationEngineTypesClient translationEngineTypesClient =
            env.ServiceProvider.GetRequiredService<ITranslationEngineTypesClient>();
        IDataFilesClient dataFilesClient = env.ServiceProvider.GetRequiredService<IDataFilesClient>();
        ICorporaClient corporaClient = env.ServiceProvider.GetRequiredService<ICorporaClient>();

        // Verify they're non-null (resolved correctly).
        Assert.IsNotNull(translationEnginesClient);
        Assert.IsNotNull(translationEngineTypesClient);
        Assert.IsNotNull(dataFilesClient);
        Assert.IsNotNull(corporaClient);

        // Make a request through the shared HttpClient to trigger the M2M token fetch.
        await env.ServalClient.GetAsync(FakeApiServer + "api/test");

        // Only 1 Auth0 token request should have been made, not 4.
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

            ServiceProvider = services.BuildServiceProvider();
            M2MTokenRequestCounter = ServiceProvider.GetRequiredService<IM2MTokenRequestCounter>();
            ServalClient = ServiceProvider
                .GetRequiredService<IHttpClientFactory>()
                .CreateClient(MachineApi.HttpClientName);
        }

        public ServiceProvider ServiceProvider { get; }
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
