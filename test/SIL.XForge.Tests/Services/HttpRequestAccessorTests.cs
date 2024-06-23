using System;
using Microsoft.AspNetCore.Http;
using NSubstitute;
using NUnit.Framework;

namespace SIL.XForge.Services;

[TestFixture]
public class HttpRequestAccessorTests
{
    [Test]
    public void SiteRoot_Development()
    {
        var env = new TestEnvironment
        {
            HttpContextAccessor =
            {
                // Set up the HTTP context with this data
                HttpContext = new DefaultHttpContext
                {
                    Request = { Host = new HostString("localhost", 5000), Scheme = "http" },
                },
            },
        };

        // SUT
        Uri expected = new Uri("http://localhost:5000/", UriKind.Absolute);
        Uri actual = env.Service.SiteRoot;
        Assert.AreEqual(expected, actual);
    }

    [Test]
    public void SiteRoot_Production()
    {
        var env = new TestEnvironment
        {
            HttpContextAccessor =
            {
                // Set up the HTTP context with this data
                HttpContext = new DefaultHttpContext
                {
                    Request = { Host = new HostString("scriptureforge.org", 443), Scheme = "https" },
                },
            },
        };

        // SUT
        Uri expected = new Uri("https://scriptureforge.org/", UriKind.Absolute);
        Uri actual = env.Service.SiteRoot;
        Assert.AreEqual(expected, actual);
    }

    private class TestEnvironment
    {
        public TestEnvironment()
        {
            HttpContextAccessor = Substitute.For<IHttpContextAccessor>();
            HttpContextAccessor.HttpContext = new DefaultHttpContext();
            Service = new HttpRequestAccessor(HttpContextAccessor);
        }

        public IHttpContextAccessor HttpContextAccessor { get; }
        public HttpRequestAccessor Service { get; }
    }
}
