namespace SIL.XForge.Configuration;

/// <summary>
/// This class defines the authentication configuration that may be rendered on the frontend website.
/// </summary>
public class PublicAuthOptions
{
    public string Audience { get; init; } = string.Empty;
    public string Domain { get; init; } = string.Empty;
    public string FrontendClientId { get; init; } = string.Empty;
    public string Scope { get; init; } = string.Empty;
}
