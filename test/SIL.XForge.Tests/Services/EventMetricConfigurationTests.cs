using Autofac;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using MongoDB.Driver;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.DataAccess;
using SIL.XForge.EventMetrics;

namespace SIL.XForge.Services;

[TestFixture]
public class EventMetricConfigurationTests
{
    [Test]
    public void CreateEventMetricsIndexes_Success()
    {
        var env = new TestEnvironment();

        // SUT
        DataAccessServiceCollectionExtensions.CreateEventMetricsIndexes(env.EventMetricIndexManager);
        env.EventMetricIndexManager.ReceivedWithAnyArgs().CreateMany(models: []);
    }

    [Test]
    public void GetEventLogger_Success()
    {
        var env = new TestEnvironment();

        // SUT
        EventMetricLogger actual = EventMetricsContainerBuilderExtensions.GetEventLogger(env.ComponentContext);
        Assert.IsNotNull(actual);
    }

    private class TestEnvironment
    {
        public TestEnvironment()
        {
            // Set up the component context for EventMetricLogger
            var containerBuilder = new ContainerBuilder();
            var repository = Substitute.For<IRepository<EventMetric>>();
            containerBuilder.RegisterInstance(repository);
            var logger = Substitute.For<ILogger<EventMetric>>();
            containerBuilder.RegisterInstance(logger);
            ComponentContext = containerBuilder.Build();
        }

        public IComponentContext ComponentContext { get; }
        public IMongoIndexManager<EventMetric> EventMetricIndexManager { get; } =
            Substitute.For<IMongoIndexManager<EventMetric>>();
    }
}
