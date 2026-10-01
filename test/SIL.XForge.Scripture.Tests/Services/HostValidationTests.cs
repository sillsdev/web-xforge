using System.Net;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.DependencyInjection;
using NUnit.Framework;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class HostValidationTests
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
    public async Task AllowedHostWithPortAndDifferentCase_IsAccepted()
    {
        var env = new TestEnvironment();

        // SUT
        (int statusCode, string? host) = await env.SendRequestAsync("ScriptureForge.org:443");

        Assert.That(statusCode, Is.EqualTo(StatusCodes.Status200OK));
        Assert.That(host, Is.EqualTo("ScriptureForge.org"));
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
    public async Task MissingHost_IsRejected()
    {
        var env = new TestEnvironment();

        // SUT
        (int statusCode, string? host) = await env.SendRequestAsync("");

        Assert.That(statusCode, Is.EqualTo(StatusCodes.Status400BadRequest));
        Assert.That(host, Is.Null);
    }

    [Test]
    public async Task AllowedForwardedHost_IsAcceptedWhenProxyHostIsNotListed()
    {
        // A reverse proxy connects to the app at its own address and forwards the host the user requested
        var env = new TestEnvironment();

        // SUT
        (int statusCode, string? host) = await env.SendRequestAsync("localhost:5000", "example.org");

        Assert.That(statusCode, Is.EqualTo(StatusCodes.Status200OK));
        Assert.That(host, Is.EqualTo("example.org"));
    }

    [Test]
    public async Task UnlistedForwardedHost_IsRejected()
    {
        var env = new TestEnvironment();

        // SUT
        (int statusCode, string? host) = await env.SendRequestAsync("localhost:5000", "evil.example");

        Assert.That(statusCode, Is.EqualTo(StatusCodes.Status400BadRequest));
        Assert.That(host, Is.Null);
    }

    [Test]
    public async Task UnlistedForwardedHost_IsNotAppliedOverAllowedHost()
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
            string[] allowedHosts = ["scriptureforge.org", "example.org"];
            ServiceProvider services = new ServiceCollection().AddLogging().BuildServiceProvider();

            // Same as in Startup
            var app = new ApplicationBuilder(services);
            app.UseForwardedHeaders(
                new ForwardedHeadersOptions { ForwardedHeaders = ForwardedHeaders.All, AllowedHosts = allowedHosts }
            );
            app.UseHostValidation(allowedHosts);
            app.Run(context =>
            {
                _hostSeenByApp = context.Request.Host.Host;
                return Task.CompletedTask;
            });
            _pipeline = app.Build();
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
