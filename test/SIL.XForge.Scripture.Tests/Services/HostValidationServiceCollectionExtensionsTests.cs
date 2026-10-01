using System.Collections.Generic;
using System.Net;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.HostFiltering;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NUnit.Framework;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class HostValidationServiceCollectionExtensionsTests
{
    [Test]
    public async Task AllowedHost_IsAccepted()
    {
        var env = new TestEnvironment();

        // SUT
        (int statusCode, string? host) = await env.SendRequestAsync("scriptureforge.org");

        Assert.That(statusCode, Is.EqualTo(StatusCodes.Status200OK));
        Assert.That(host, Is.EqualTo("scriptureforge.org"));
    }

    [Test]
    public async Task UnlistedHost_IsRejected()
    {
        var env = new TestEnvironment();

        // SUT
        (int statusCode, string? host) = await env.SendRequestAsync("evil.example");

        Assert.That(statusCode, Is.EqualTo(StatusCodes.Status400BadRequest));
        Assert.That(host, Is.Null);
    }

    [Test]
    public async Task AllowedForwardedHost_IsApplied()
    {
        var env = new TestEnvironment();

        // SUT
        (int statusCode, string? host) = await env.SendRequestAsync("scriptureforge.org", "example.org");

        Assert.That(statusCode, Is.EqualTo(StatusCodes.Status200OK));
        Assert.That(host, Is.EqualTo("example.org"));
    }

    [Test]
    public async Task UnlistedForwardedHost_IsNotApplied()
    {
        var env = new TestEnvironment();

        // SUT
        (int statusCode, string? host) = await env.SendRequestAsync("scriptureforge.org", "evil.example");

        Assert.That(statusCode, Is.EqualTo(StatusCodes.Status200OK));
        Assert.That(host, Is.EqualTo("scriptureforge.org"));
    }

    private class TestEnvironment
    {
        private readonly RequestDelegate _pipeline;
        private string? _hostSeenByApp;

        public TestEnvironment()
        {
            IConfiguration configuration = new ConfigurationBuilder()
                .AddInMemoryCollection(
                    new Dictionary<string, string?>
                    {
                        ["Site:Origin"] = "https://scriptureforge.org;https://example.org",
                    }
                )
                .Build();
            ServiceProvider services = new ServiceCollection().AddHostValidation(configuration).BuildServiceProvider();

            // In the app, host filtering is added ahead of the whole pipeline, so it runs before forwarded headers
            var forwardedHeaders = new ForwardedHeadersMiddleware(
                context =>
                {
                    _hostSeenByApp = context.Request.Host.Host;
                    return Task.CompletedTask;
                },
                NullLoggerFactory.Instance,
                services.GetRequiredService<IOptions<ForwardedHeadersOptions>>()
            );
            var hostFiltering = new HostFilteringMiddleware(
                forwardedHeaders.Invoke,
                NullLogger<HostFilteringMiddleware>.Instance,
                services.GetRequiredService<IOptionsMonitor<HostFilteringOptions>>()
            );
            _pipeline = hostFiltering.Invoke;
        }

        public async Task<(int statusCode, string? host)> SendRequestAsync(string host, string? forwardedHost = null)
        {
            var context = new DefaultHttpContext();
            // Forwarded headers are only honored from a known proxy, which by default means loopback
            context.Connection.RemoteIpAddress = IPAddress.Loopback;
            context.Request.Host = new HostString(host);
            if (forwardedHost != null)
                context.Request.Headers["X-Forwarded-Host"] = forwardedHost;

            await _pipeline(context);
            return (context.Response.StatusCode, _hostSeenByApp);
        }
    }
}
