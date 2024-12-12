using Autofac;
using Autofac.Extras.DynamicProxy;
using Castle.DynamicProxy;
using Microsoft.Extensions.DependencyInjection;
using SIL.XForge.Services;

namespace SIL.XForge.EventMetrics;

/// <summary>
/// Extension methods for <see cref="ContainerBuilder"/> for <see cref="EventMetric"/> handling.
/// </summary>
public static class EventMetricsContainerBuilderExtensions
{
    /// <summary>
    /// Adds the event metrics service.
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <returns>The service collection.</returns>
    public static IServiceCollection AddEventMetrics(this IServiceCollection services) =>
        services.AddSingleton<IEventMetricService, EventMetricService>();

    /// <summary>
    /// Register the <see cref="EventMetricLogger"/> interceptor.
    /// </summary>
    /// <param name="containerBuilder">The container builder.</param>
    public static void RegisterEventMetrics(this ContainerBuilder containerBuilder) =>
        containerBuilder.RegisterType<EventMetricLogger>().AsSelf().As<IInterceptor>().SingleInstance();

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
}
