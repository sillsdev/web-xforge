namespace SIL.XForge.Scripture.Models;

/// <summary>
/// A response to a request for a health check.
/// </summary>
public class HealthCheckResponse
{
    /// <summary>
    /// The <see cref="StatusSummary"/> when all systems are healthy.
    /// </summary>
    public const string Healthy = "All systems are healthy.";

    /// <summary>
    /// The <see cref="StatusSummary"/> when one or more systems are down.
    /// </summary>
    public const string Down = "Some systems are down.";

    /// <summary>
    /// Gets or sets the health check status for Mongo.
    /// </summary>
    public HealthCheckComponent Mongo { get; } = new HealthCheckComponent();

    /// <summary>
    /// Gets or sets the health check status for the Realtime Server.
    /// </summary>
    public HealthCheckComponent RealtimeServer { get; } = new HealthCheckComponent();

    /// <summary>
    /// Gets the status summary.
    /// </summary>
    public string StatusSummary => Mongo.Up && RealtimeServer.Up ? Healthy : Down;
}
