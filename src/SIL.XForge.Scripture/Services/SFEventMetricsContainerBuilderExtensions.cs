using Autofac;
using SIL.XForge.EventMetrics;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Scripture Forge specific extension methods for <see cref="ContainerBuilder"/> for <see cref="EventMetric"/> handling.
/// </summary>
public static class SFEventMetricsContainerBuilderExtensions
{
    /// <summary>
    /// Registers the event metrics implementation for Scripture Forge.
    /// </summary>
    /// <param name="containerBuilder">The container builder.</param>
    /// <remarks>
    /// To be called from <see cref="Startup"/>.
    /// </remarks>
    public static void RegisterSFEventMetrics(this ContainerBuilder containerBuilder)
    {
        containerBuilder.RegisterEventMetrics();
        containerBuilder.RegisterEventMetrics<IMachineApiService, MachineApiService>();
        containerBuilder.RegisterEventMetrics<ISFProjectService, SFProjectService>();
        containerBuilder.RegisterEventMetrics<ISyncService, SyncService>();
    }
}
