namespace SIL.XForge.Configuration;

/// <summary>
/// Configuration options for Serval.
/// </summary>
public class ServalOptions
{
    public string ApiServer { get; set; } = string.Empty;
    public string Audience { get; set; } = string.Empty;
    public string ClientId { get; set; } = string.Empty;
    public string ClientSecret { get; set; } = string.Empty;
    public string TokenUrl { get; set; } = string.Empty;
    public string WebhookSecret { get; set; } = string.Empty;
}
