using System;
using System.Linq;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Configuration;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class RazorPageSettingsTests
{
    [Test]
    public void GetAuthOptions_Success()
    {
        var env = new TestEnvironment();
        const string audience = "audience";
        const string domain = "domain";
        const string frontendClientId = "frontend_client_id";
        const string scope = "scope";
        env.AuthOptions.Value.Returns(
            new AuthOptions
            {
                Audience = audience,
                Domain = domain,
                FrontendClientId = frontendClientId,
                Scope = scope,
            }
        );

        // SUT
        PublicAuthOptions actual = env.Service.GetAuthOptions();
        Assert.AreEqual(audience, actual.Audience);
        Assert.AreEqual(domain, actual.Domain);
        Assert.AreEqual(frontendClientId, actual.FrontendClientId);
        Assert.AreEqual(scope, actual.Scope);
    }

    [Test]
    public void GetBugsnagConfig_Success()
    {
        var env = new TestEnvironment();
        const string apiKey = "api_key";
        string[] notifyReleaseStages = ["live", "qa"];
        const string releaseStage = "development";
        env.BugsnagOptions.Value.Returns(
            new BugsnagOptions
            {
                ApiKey = apiKey,
                NotifyReleaseStages = notifyReleaseStages,
                ReleaseStage = releaseStage,
            }
        );

        string expected = $$"""
            {
              "apiKey": "{{apiKey}}",
              "appVersion": "{{Product.Version}}",
              "notifyReleaseStages": [
                "{{notifyReleaseStages.First()}}",
                "{{notifyReleaseStages.Last()}}"
              ],
              "releaseStage": "{{releaseStage}}"
            }
            """.ReplaceLineEndings(Environment.NewLine);

        // SUT
        string actual = env.Service.GetBugsnagConfig();
        Assert.AreEqual(expected, actual);
    }

    [Test]
    public void GetProductVersion_Success()
    {
        var env = new TestEnvironment();

        // SUT
        string actual = env.Service.GetProductVersion();
        Assert.AreEqual(Product.Version, actual);
    }

    [Test]
    public void GetSiteName_ScriptureForge()
    {
        var env = new TestEnvironment();
        const string hostName = "scriptureforge.org";
        const string siteName = "Scripture Forge";
        env.HttpContextAccessor.HttpContext!.Request.Host = new HostString(hostName);
        env.SiteOptions.Value.Returns(new SiteOptions { Name = siteName });

        // SUT
        string actual = env.Service.GetSiteName();
        Assert.AreEqual(siteName, actual);
    }

    [Test]
    public void GetSiteName_WhiteLabel()
    {
        var env = new TestEnvironment();
        const string hostName = "example.com";
        const string siteName = "Scripture Forge";
        env.HttpContextAccessor.HttpContext!.Request.Host = new HostString(hostName);
        env.SiteOptions.Value.Returns(new SiteOptions { Name = siteName });

        // SUT
        string actual = env.Service.GetSiteName();
        Assert.AreEqual(hostName, actual);
    }

    [TestCase("127.0.0.1")]
    [TestCase("example.com")]
    public void UseScriptureForgeBranding_Failure(string hostName)
    {
        var env = new TestEnvironment();
        env.HttpContextAccessor.HttpContext!.Request.Host = new HostString(hostName);

        // SUT
        bool actual = env.Service.UseScriptureForgeBranding();
        Assert.IsFalse(actual);
    }

    [Test]
    public void UseScriptureForgeBranding_NoHttpContext()
    {
        var env = new TestEnvironment { HttpContextAccessor = { HttpContext = null } };

        // SUT
        bool actual = env.Service.UseScriptureForgeBranding();
        Assert.IsFalse(actual);
    }

    [TestCase("localhost")]
    [TestCase("scriptureforge.org")]
    [TestCase("qa.scriptureforge.org")]
    public void UseScriptureForgeBranding_Success(string hostName)
    {
        var env = new TestEnvironment();
        env.HttpContextAccessor.HttpContext!.Request.Host = new HostString(hostName);

        // SUT
        bool actual = env.Service.UseScriptureForgeBranding();
        Assert.IsTrue(actual);
    }

    private class TestEnvironment
    {
        public TestEnvironment()
        {
            HttpContextAccessor = Substitute.For<IHttpContextAccessor>();
            HttpContextAccessor.HttpContext = new DefaultHttpContext();
            Service = new RazorPageSettings(AuthOptions, BugsnagOptions, HttpContextAccessor, SiteOptions);
        }

        public IOptions<AuthOptions> AuthOptions { get; } = Substitute.For<IOptions<AuthOptions>>();
        public IOptions<BugsnagOptions> BugsnagOptions { get; } = Substitute.For<IOptions<BugsnagOptions>>();
        public IHttpContextAccessor HttpContextAccessor { get; }
        public RazorPageSettings Service { get; }
        public IOptions<SiteOptions> SiteOptions { get; } = Substitute.For<IOptions<SiteOptions>>();
    }
}
