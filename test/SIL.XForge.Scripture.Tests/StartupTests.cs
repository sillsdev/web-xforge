using System;
using Autofac.Extensions.DependencyInjection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using NSubstitute;
using NUnit.Framework;

namespace SIL.XForge.Scripture;

/// <summary>
/// Represents what environment the application is running in.
/// </summary>
public enum RunMode
{
    Development,
    Production,
}

[TestFixture]
public class StartupTests
{
    [Test]
    public void ConfigureServices_Success()
    {
        var env = new TestEnvironment();

        // SUT
        IServiceProvider actual = env.Startup.ConfigureServices(env.Services);
        Assert.IsInstanceOf<AutofacServiceProvider>(actual);
    }

    [Test]
    public void IsSpaRoute_MethodNotGet_NotRoute()
    {
        var env = new TestEnvironment();
        env.Context.Request.Method = HttpMethods.Post;
        env.Context.Request.Path = new PathString("/system-administration");

        // SUT
        bool actual = env.Startup.IsSpaRoute(env.Context);
        Assert.IsFalse(actual);
    }

    [Test]
    public void IsSpaRoute_RootPath_NotRoute()
    {
        var env = new TestEnvironment();
        env.Context.Request.Path = new PathString("/");

        // SUT
        bool actual = env.Startup.IsSpaRoute(env.Context);
        Assert.IsFalse(actual);
    }

    [Test]
    public void IsSpaRoute_InvalidPath_NotRoute()
    {
        var env = new TestEnvironment();
        env.Context.Request.Path = new PathString("/invalid-path");

        // SUT
        bool actual = env.Startup.IsSpaRoute(env.Context);
        Assert.IsFalse(actual);
    }

    [Test]
    public void IsSpaRoute_ValidPath_IsRoute()
    {
        var env = new TestEnvironment();
        env.Context.Request.Path = new PathString("/system-administration");

        // SUT
        bool actual = env.Startup.IsSpaRoute(env.Context);
        Assert.IsTrue(actual);
    }

    [Test]
    public void IsSpaRoute_ValidMultiPath_IsRoute()
    {
        var env = new TestEnvironment();
        env.Context.Request.Path = new PathString("/system-administration/more");

        // SUT
        bool actual = env.Startup.IsSpaRoute(env.Context);
        Assert.IsTrue(actual);
    }

    [Test]
    public void IsSpaRoute_DevelopmentPath_IsRoute()
    {
        var env = new TestEnvironment(Environments.Development);
        env.Context.Request.Path = new PathString("/sockjs-node");

        // SUT
        bool actual = env.Startup.IsSpaRoute(env.Context);
        Assert.IsTrue(actual);
    }

    [Test]
    public void IsSpaRoute_DevelopmentPathValidPost_IsRoute()
    {
        var env = new TestEnvironment(Environments.Development);
        env.Context.Request.Method = HttpMethods.Post;
        env.Context.Request.Path = new PathString("/sockjs-node");

        // SUT
        bool actual = env.Startup.IsSpaRoute(env.Context);
        Assert.IsTrue(actual);
    }

    [Test]
    public void IsSpaRoute_ProductionPath_IsRoute()
    {
        // These are files like chunk-FO3Z2R2V.js, polyfills-DL4GMTU5.js, and main-4DFYH4AF.js.
        var env = new TestEnvironment(Environments.Production);
        env.Context.Request.Path = new PathString("/chunk-FO3Z2R2V.js");

        // SUT
        bool actual = env.Startup.IsSpaRoute(env.Context);
        Assert.IsTrue(actual);
    }

    [TestCase("/nope", new RunMode[] { RunMode.Development, RunMode.Production }, false)]
    // Development case - expected=true
    [TestCase("/chunk-OPHL7TCV.js", new RunMode[] { RunMode.Development }, true)]
    [TestCase("/chunk-4ZGUQGYD.js", new RunMode[] { RunMode.Development }, true)]
    [TestCase("/polyfills.js", new RunMode[] { RunMode.Development }, true)]
    [TestCase("/main.js", new RunMode[] { RunMode.Development }, true)]
    [TestCase("/manifest.json", new RunMode[] { RunMode.Development }, true)]
    [TestCase("/styles.css", new RunMode[] { RunMode.Development }, true)]
    [TestCase("/assets/icons/sf-192x192.png", new RunMode[] { RunMode.Development }, true)]
    [TestCase("/@vite/client", new RunMode[] { RunMode.Development }, true)]
    [TestCase("/login?sign-up=true", new RunMode[] { RunMode.Development }, true)]
    [TestCase("/login", new RunMode[] { RunMode.Development }, true)]
    [TestCase(
        "/@fs/home/user/web-xforge/src/SIL.XForge.Scripture/ClientApp/node_modules/vite/dist/client/env.mjs",
        new RunMode[] { RunMode.Development },
        true
    )]
    [TestCase("/assets/images/sf_logo_with_name_black.svg", new RunMode[] { RunMode.Development }, true)]
    [TestCase("/worker-GCZANHET.js", new RunMode[] { RunMode.Development }, true)]
    [TestCase("/en-GHIDLE4X.js", new RunMode[] { RunMode.Development }, true)]
    [TestCase("/en-LPQIY5ZH.js", new RunMode[] { RunMode.Development }, true)]
    [TestCase("/quill-QEGMXGGM.js", new RunMode[] { RunMode.Development }, true)]
    // Development case - expected=false
    [TestCase("/favicon.ico", new RunMode[] { RunMode.Development }, false)]
    [TestCase(
        "/lib/material-design-lite/css/material.sf_grey-pt_green.min.css",
        new RunMode[] { RunMode.Development },
        false
    )]
    [TestCase("/css/sf.min.css", new RunMode[] { RunMode.Development }, false)]
    [TestCase("/images/multi-devices.svg", new RunMode[] { RunMode.Development }, false)]
    [TestCase("/images/community-checking.svg", new RunMode[] { RunMode.Development }, false)]
    [TestCase("/images/quoter.jpg", new RunMode[] { RunMode.Development }, false)]
    [TestCase("/terms", new RunMode[] { RunMode.Development }, false)]
    [TestCase("/privacy", new RunMode[] { RunMode.Development }, false)]
    [TestCase("/lib/material-design-lite/js/material.min.js", new RunMode[] { RunMode.Development }, false)]
    [TestCase("/_framework/aspnetcore-browser-refresh.js", new RunMode[] { RunMode.Development }, false)]
    public void IsSpaRoute_(string path, RunMode[] runModes, bool expected)
    {
        foreach (RunMode runMode in runModes)
        {
            var env = new TestEnvironment(runMode.ToString());
            env.Context.Request.Method = HttpMethods.Get;
            env.Context.Request.Path = new PathString(path);

            // SUT
            bool actual = env.Startup.IsSpaRoute(env.Context);
            Assert.AreEqual(expected, actual, $"Failed for path {path}, runMode {runMode}.");
        }
    }

    private class TestEnvironment
    {
        public TestEnvironment(string? environmentName = null)
        {
            Context.Request.Method = HttpMethods.Get;
            var configuration = Substitute.For<IConfiguration>();
            var loggerFactory = Substitute.For<ILoggerFactory>();
            var environment = Substitute.For<IWebHostEnvironment>();
            if (!string.IsNullOrWhiteSpace(environmentName))
            {
                environment.EnvironmentName = environmentName;
            }

            Startup = new Startup(configuration, environment, loggerFactory);
        }

        public HttpContext Context { get; } = Substitute.For<HttpContext>();
        public IServiceCollection Services { get; } = new ServiceCollection();
        public Startup Startup { get; }
    }
}
