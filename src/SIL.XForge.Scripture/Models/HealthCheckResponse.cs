namespace SIL.XForge.Scripture.Models;

/// <summary>
/// A response to a request for a health check.
/// </summary>
public class HealthCheckResponse
{
    /// <summary>
    /// Gets or sets the health check status for Mongo.
    /// </summary>
    public HealthCheckComponent Mongo { get; set; } = new HealthCheckComponent();

    /// <summary>
    /// Gets or sets the health check status for the Realtime Server.
    /// </summary>
    public HealthCheckComponent RealtimeServer { get; set; } = new HealthCheckComponent();

    /// <summary>
    /// Gets or sets the health check status for Serval.
    /// </summary>
    public HealthCheckComponent Serval { get; set; } = new HealthCheckComponent();
}
