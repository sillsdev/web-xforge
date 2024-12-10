using Autofac;
using Autofac.Extensions.DependencyInjection;
using Autofac.Extras.DynamicProxy;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using NUnit.Framework;
using SIL.XForge.DataAccess;
using SIL.XForge.EventMetrics;

namespace SIL.XForge.Services;

[TestFixture]
public class EventMetricLoggerTests
{
    [Test]
    public void MyTest_Success()
    {
        var env = new TestEnvironment();

        // SUT
        bool actual = env.TestClass.TestNoArguments();
        Assert.IsTrue(actual);

        // TODO: The interceptor starts an asynchronous task, so we need to wait for that
        // Maybe use TaskCompletionSource?
    }

    private class TestEnvironment
    {
        public TestEnvironment()
        {
            var services = new ServiceCollection();
            services.AddSingleton<TestClass>();
            var containerBuilder = new ContainerBuilder();
            containerBuilder.Populate(services);
            containerBuilder.RegisterEventMetrics();
            containerBuilder.RegisterEventMetrics<TestClass>();
            containerBuilder.RegisterInstance(EventMetrics);
            containerBuilder.RegisterInstance<ILogger<EventMetric>>(MockLogger);
            var container = containerBuilder.Build();
            EventMetricLogger = container.Resolve<EventMetricLogger>();
            TestClass = container.Resolve<TestClass>();
        }

        public EventMetricLogger EventMetricLogger { get; }
        public IRepository<EventMetric> EventMetrics { get; } = new MemoryRepository<EventMetric>();
        public MockLogger<EventMetric> MockLogger { get; } = new MockLogger<EventMetric>();
        public TestClass TestClass { get; }
    }

    /// <summary>
    /// The class that will test the interceptor.
    /// </summary>
    [Intercept(typeof(EventMetricLogger))]
    public class TestClass
    {
        [LogEventMetric(EventScope.Drafting)]
        public virtual bool TestNoArguments() => true;
    }
}
