namespace SIL.XForge.Configuration;

/// <summary>
/// This class defines the authentication configuration.
/// </summary>
public class AuthOptions : PublicAuthOptions
{
    public string BackendClientId { get; init; } = string.Empty;
    public string BackendClientSecret { get; init; } = string.Empty;
    public string HealthCheckApiKey { get; init; } = string.Empty;
    public string ManagementAudience { get; init; } = string.Empty;
    public string WebhookUsername { get; init; } = string.Empty;
    public string WebhookPassword { get; init; } = string.Empty;
}
