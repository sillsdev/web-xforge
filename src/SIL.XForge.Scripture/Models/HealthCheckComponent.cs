namespace SIL.XForge.Scripture.Models;

/// <summary>
/// The health check status for a component
/// </summary>
public class HealthCheckComponent
{
    /// <summary>
    /// Gets or sets a value indicating if the component is up.
    /// </summary>
    public bool Up { get; set; }

    /// <summary>
    /// Gets or sets the response time to the component (in milliseconds).
    /// </summary>
    public long Time { get; set; }

    /// <summary>
    /// Gets or sets the status of the component.
    /// </summary>
    public string Status { get; set; } = string.Empty;
}
