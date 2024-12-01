using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Configuration;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class DependencyInjectionTests
{
    [Test]
    public void AddConfiguration_Success()
    {
        var env = new TestEnvironment();

        // SUT
        env.Services.AddConfiguration(env.Configuration);
        env.Services.Received().Add(Arg.Any<ServiceDescriptor>());
    }

    [Test]
    public void AddSFServices_Success()
    {
        var env = new TestEnvironment();

        // SUT
        env.Services.AddSFServices();
        env.Services.Received().Add(Arg.Any<ServiceDescriptor>());
    }

    private class TestEnvironment
    {
        public IConfiguration Configuration { get; } = Substitute.For<IConfiguration>();
        public IServiceCollection Services { get; } = Substitute.For<IServiceCollection>();
    }
}
