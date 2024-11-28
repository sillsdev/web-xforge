namespace SIL.XForge.Configuration;

/// <summary>
/// This class defines the authentication configuration.
/// </summary>
public class AuthOptions : PublicAuthOptions
{
    public string BackendClientId { get; set; }
    public string BackendClientSecret { get; set; }
    public string HealthCheckApiKey { get; set; }
    public string ManagementAudience { get; set; }
    public string WebhookUsername { get; set; }
    public string WebhookPassword { get; set; }
}
