using System;
using NUnit.Framework;

namespace SIL.XForge.Configuration;

[TestFixture]
public class SiteOptionsTests
{
    [Test]
    public void GetOriginHosts_ProductionStyleOrigins()
    {
        var siteOptions = new SiteOptions { Origin = "https://scriptureforge.org;https://example.org" };

        // SUT
        string[] hosts = siteOptions.GetOriginHosts();

        Assert.That(hosts, Is.EqualTo(["scriptureforge.org", "example.org"]));
    }

    [Test]
    public void GetOriginHosts_IgnoresEmptyEntries()
    {
        // The deploy script writes a trailing separator when there is no alternate domain
        var siteOptions = new SiteOptions { Origin = "https://qa.scriptureforge.org;" };

        // SUT
        string[] hosts = siteOptions.GetOriginHosts();

        Assert.That(hosts, Is.EqualTo(["qa.scriptureforge.org"]));
    }

    [Test]
    public void GetOriginHosts_DevelopmentOrigins()
    {
        var siteOptions = new SiteOptions
        {
            Origin =
                "http://localhost:5000;http://127.0.0.1:5000;https://localhost:5001;https://127.0.0.1:5001;https://bs-local.com:5001;",
        };

        // SUT
        string[] hosts = siteOptions.GetOriginHosts();

        Assert.That(hosts, Is.EqualTo(["localhost", "127.0.0.1", "bs-local.com"]));
    }

    [Test]
    public void GetOriginHosts_ThrowsWhenNoOrigins()
    {
        var siteOptions = new SiteOptions { Origin = ";" };

        // SUT
        Assert.Throws<InvalidOperationException>(() => siteOptions.GetOriginHosts());
    }

    [TestCase("example.org")]
    [TestCase("ftp://example.org")]
    [TestCase("/relative")]
    public void GetOriginHosts_ThrowsWhenEntryIsNotHttpUrl(string invalidOrigin)
    {
        var siteOptions = new SiteOptions { Origin = $"https://scriptureforge.org;{invalidOrigin}" };

        // SUT
        Assert.Throws<InvalidOperationException>(() => siteOptions.GetOriginHosts());
    }
}
