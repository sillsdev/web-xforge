using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using NSubstitute;
using NUnit.Framework;

namespace SIL.XForge.Scripture;

[TestFixture]
public class StartupTests
{
    private IConfiguration _configuration;
    private IWebHostEnvironment _env;
    private ILoggerFactory _loggerFactory;
    private Startup _startup;
    private HttpContext _context;

    [SetUp]
    public void Init()
    {
        _configuration = Substitute.For<IConfiguration>();
        _env = Substitute.For<IWebHostEnvironment>();
        _loggerFactory = Substitute.For<ILoggerFactory>();
        _startup = new Startup(_configuration, _env, _loggerFactory);
        Assert.NotNull(_startup, "Setup");
        _context = Substitute.For<HttpContext>();
        _context.Request.Method = HttpMethods.Get;
    }

    [Test]
    public void IsSpaRoute_MethodNotGet_NotRoute()
    {
        _context.Request.Method = HttpMethods.Post;
        _context.Request.Path = new PathString("/system-administration");

        Assert.IsFalse(_startup.IsSpaRoute(_context));
    }

    [Test]
    public void IsSpaRoute_RootPath_NotRoute()
    {
        _context.Request.Path = new PathString("/");

        Assert.IsFalse(_startup.IsSpaRoute(_context));
    }

    [Test]
    public void IsSpaRoute_InvalidPath_NotRoute()
    {
        _context.Request.Path = new PathString("/invalid-path");

        Assert.IsFalse(_startup.IsSpaRoute(_context));
    }

    [Test]
    public void IsSpaRoute_ValidPath_IsRoute()
    {
        _context.Request.Path = new PathString("/system-administration");

        Assert.IsTrue(_startup.IsSpaRoute(_context));
    }

    [Test]
    public void IsSpaRoute_ValidMultiPath_IsRoute()
    {
        _context.Request.Path = new PathString("/system-administration/more");

        Assert.IsTrue(_startup.IsSpaRoute(_context));
    }

    [Test]
    public void IsSpaRoute_DevelopmentPath_IsRoute()
    {
        _env.EnvironmentName = Environments.Development;
        _startup = new Startup(_configuration, _env, _loggerFactory);
        _context.Request.Path = new PathString("/sockjs-node");

        Assert.IsTrue(_startup.IsSpaRoute(_context));
    }

    [Test]
    public void IsSpaRoute_DevelopmentPathValidPost_IsRoute()
    {
        _env.EnvironmentName = Environments.Development;
        _startup = new Startup(_configuration, _env, _loggerFactory);
        _context.Request.Method = HttpMethods.Post;
        _context.Request.Path = new PathString("/sockjs-node");

        Assert.IsTrue(_startup.IsSpaRoute(_context));
    }

    [Test]
    public void IsSpaRoute_ProductionPath_IsRoute()
    {
        _env.EnvironmentName = Environments.Production;
        _startup = new Startup(_configuration, _env, _loggerFactory);
        _context.Request.Path = new PathString("/styles.a2f070be0b37085d72ba.css");

        Assert.IsTrue(_startup.IsSpaRoute(_context));
    }
}
