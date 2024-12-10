using Autofac;
using Autofac.Extras.DynamicProxy;
using Microsoft.Extensions.Logging;
using SIL.XForge.DataAccess;

namespace SIL.XForge.EventMetrics;

/// <summary>
/// Extension methods for <see cref="ContainerBuilder"/> for <see cref="EventMetric"/> handling.
/// </summary>
public static class EventMetricsContainerBuilderExtensions
{
    /// <summary>
    /// Register the <see cref="EventMetricLogger"/> interceptor.
    /// </summary>
    /// <param name="containerBuilder">The container builder.</param>
    public static void RegisterEventMetrics(this ContainerBuilder containerBuilder) =>
        containerBuilder.Register(GetEventLogger);

    /// <summary>
    /// Register event metrics for a class.
    /// </summary>
    /// <typeparam name="T">The class type.</typeparam>
    /// <param name="containerBuilder">The container builder.</param>
    public static void RegisterEventMetrics<T>(this ContainerBuilder containerBuilder)
        where T : class => containerBuilder.RegisterType<T>().EnableClassInterceptors();

    /// <summary>
    /// Register event metrics for the interface a class implements.
    /// </summary>
    /// <typeparam name="TI">The interface <c>T</c> implements.</typeparam>
    /// <typeparam name="T">The class type.</typeparam>
    /// <param name="containerBuilder">The container builder.</param>
    public static void RegisterEventMetrics<TI, T>(this ContainerBuilder containerBuilder)
        where T : class, TI => containerBuilder.RegisterType<T>().As<TI>().EnableInterfaceInterceptors();

    /// <summary>
    /// Gets the event metric logger.
    /// </summary>
    /// <param name="componentContext">The component context.</param>
    /// <returns>The instantiated <see cref="EventMetricLogger"/>.</returns>
    /// <remarks>This function is internal for unit testing purposes.</remarks>
    internal static EventMetricLogger GetEventLogger(IComponentContext componentContext)
    {
        var repository = componentContext.Resolve<IRepository<EventMetric>>();
        var logger = componentContext.Resolve<ILogger<EventMetric>>();
        return new EventMetricLogger(repository, logger);
    }
}
