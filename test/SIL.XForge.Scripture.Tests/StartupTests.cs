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
        var env = new TestEnvironment(Environments.Production);
        env.Context.Request.Path = new PathString("/styles.a2f070be0b37085d72ba.css");

        // SUT
        bool actual = env.Startup.IsSpaRoute(env.Context);
        Assert.IsTrue(actual);
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
