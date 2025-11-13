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

    private static void IsSpaRoute_Helper(string path, RunMode[] runModes, bool expected)
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

    // SPA route in production and development
    [TestCase("/index.html")]
    [TestCase("/chunk-A1B2C3D4.js")]
    [TestCase("/chunk-A1B2C3D4.js.map")]
    [TestCase("/chunk-E5F6G7H8.js")]
    [TestCase("/chunk-E5F6G7H8.js.map")]
    [TestCase("/main-Y5Z6A1B2.js")]
    [TestCase("/main-Y5Z6A1B2.js.map")]
    [TestCase("/polyfills-C3D4E5F6.js")]
    [TestCase("/polyfills-C3D4E5F6.js.map")]
    [TestCase("/styles-G7H8I9J0.css")]
    [TestCase("/en-M3N4O5P6.js")]
    [TestCase("/en-M3N4O5P6.js.map")]
    [TestCase("/en-Q7R8S9T0.js")]
    [TestCase("/en-Q7R8S9T0.js.map")]
    [TestCase("/quill-U1V2W3X4.js")]
    [TestCase("/quill-U1V2W3X4.js.map")]
    [TestCase("/ngx-quill-quill-U1V2W3X4.js")]
    [TestCase("/3rdpartylicenses.txt")]
    [TestCase("/safety-worker.js")]
    [TestCase("/sf-service-worker.js")]
    [TestCase("/ngsw.json")]
    [TestCase("/ngsw-worker.js")]
    [TestCase("/offline.html")]
    [TestCase("/prerendered-routes.json")]
    [TestCase("/manifest.json")]
    [TestCase("/assets/icons/sf-192x192.png")]
    [TestCase("/assets/images/sf_logo_with_name_black.svg")]
    [TestCase("/worker-I9J0K1L2.js")]
    [TestCase("/worker-I9J0K1L2.js.map")]
    [TestCase("/worker-basic.min.js")]
    [TestCase("/node_modules_sillsdev_lynx")]
    [TestCase("/projects")]
    [TestCase("/projects/abc123/translate/GEN/1")]
    [TestCase("/login")]
    [TestCase("/login?sign-up=true")]
    [TestCase("/join/AbCd/en-GB")]
    [TestCase("/callback/auth0?code=1234&state=abcd")]
    [TestCase("/connect-project")]
    [TestCase("/serval-administration")]
    [TestCase("/system-administration")]
    // Handling '//login' may not be very important but would make sense to handle it as if it was normalized to
    // '/login'.
    [TestCase("//login")]
    [TestCase("//login//")]
    [TestCase("///login")]
    public void IsSpaRoute_ProductionAndDevelopment_True(string path)
    {
        RunMode[] runModes = [RunMode.Production, RunMode.Development];
        const bool expected = true;
        IsSpaRoute_Helper(path, runModes, expected);
    }

    // SPA route in development, but not expected in production
    [TestCase("/@vite/client")]
    [TestCase("/@fs/home/user/web-xforge/src/SIL.XForge.Scripture/ClientApp/node_modules/vite/dist/client/env.mjs")]
    // `ng serve` with caching+prebundling can result in files like `main.js`, `polyfill.js`, and `styles.css` with no
    // hashes in the filename.
    [TestCase("/main.js")]
    [TestCase("/polyfills.js")]
    [TestCase("/styles.css")]
    public void IsSpaRoute_Development_True(string path)
    {
        RunMode[] runModes = [RunMode.Development];
        const bool expected = true;
        IsSpaRoute_Helper(path, runModes, expected);
    }

    // ASP.NET-handled path in production and development
    [TestCase("/favicon.ico")]
    [TestCase("/css/sf.min.css")]
    [TestCase("/images/EarthLightsSmall.jpg")]
    [TestCase("/scss/mixins/_breakpoints.scss")]
    [TestCase("/scss/sf.scss")]
    [TestCase("/images/multi-devices.svg")]
    [TestCase("/images/community-checking.svg")]
    [TestCase("/images/quoter.jpg")]
    [TestCase("/terms")]
    [TestCase("/privacy")]
    [TestCase("/lib/material-design-lite/js/material.min.js")]
    [TestCase("/lib/material-design-lite/css/material.sf_grey-pt_green.min.css")]
    [TestCase("/non-existent-page")]
    [TestCase("/?login")]
    [TestCase("/?/login")]
    [TestCase("//?login")]
    [TestCase("//?/login")]
    [TestCase("/??login")]
    [TestCase("/??/login")]
    [TestCase("/#login")]
    [TestCase("/#/login")]
    // It may or may not be possible in practice for the path to be null or empty. If it is, let's have ASP.NET handle
    // it.
    [TestCase(null)]
    [TestCase("")]
    // The paths "/", "/Index", and "/Status/Error" are handled by ASP.NET and don't even get to IsSpaRoute. If they did
    // for some reason, we'll have IsSpaRoute return false.
    [TestCase("/")]
    [TestCase("/Index")]
    [TestCase("/Status/Error")]
    // Paths with a beginning that start to match an SPA path, but ultimately don't, can be handled by ASP.NET.
    [TestCase("/mainly")]
    [TestCase("/enquiry")]
    [TestCase("/workerbee")]
    public void IsSpaRoute_ProductionAndDevelopment_False(string path)
    {
        RunMode[] runModes = [RunMode.Production, RunMode.Development];
        const bool expected = false;
        IsSpaRoute_Helper(path, runModes, expected);
    }

    // ASP.NET-handled path in development, but not expected in production
    [TestCase("/_framework/aspnetcore-browser-refresh.js")]
    public void IsSpaRoute_Development_False(string path)
    {
        RunMode[] runModes = [RunMode.Development];
        const bool expected = false;
        IsSpaRoute_Helper(path, runModes, expected);
    }

    /// <summary>
    /// Represents what environment the application is running in.
    /// </summary>
    private enum RunMode
    {
        Development,
        Production,
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
