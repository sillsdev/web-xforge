using Autofac;
using Castle.DynamicProxy;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Configuration;
using SIL.XForge.EventMetrics;

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

    [Test]
    public void RegisterEventMetrics_RegistersAClass()
    {
        var env = new TestEnvironment();

        // SUT
        env.ContainerBuilder.RegisterEventMetrics<SFProjectService>();
        IContainer container = env.ContainerBuilder.Build();
        Assert.IsTrue(container.IsRegistered<SFProjectService>());
    }

    [Test]
    public void RegisterEventMetrics_RegistersAnInterface()
    {
        var env = new TestEnvironment();

        // SUT
        env.ContainerBuilder.RegisterEventMetrics<ISFProjectService, SFProjectService>();
        IContainer container = env.ContainerBuilder.Build();
        Assert.IsTrue(container.IsRegistered<ISFProjectService>());
    }

    [Test]
    public void RegisterEventMetrics_RegistersTheInterceptor()
    {
        var env = new TestEnvironment();

        // SUT
        env.ContainerBuilder.RegisterEventMetrics();
        IContainer container = env.ContainerBuilder.Build();
        Assert.IsTrue(container.IsRegistered<IInterceptor>());
    }

    [Test]
    public void RegisterSFEventMetrics_Success()
    {
        var env = new TestEnvironment();

        // SUT
        env.ContainerBuilder.RegisterSFEventMetrics();
        IContainer container = env.ContainerBuilder.Build();
        Assert.IsTrue(container.IsRegistered<IInterceptor>());
    }

    private class TestEnvironment
    {
        public IConfiguration Configuration { get; } = Substitute.For<IConfiguration>();
        public ContainerBuilder ContainerBuilder { get; } = new ContainerBuilder();
        public IServiceCollection Services { get; } = Substitute.For<IServiceCollection>();
    }
}
