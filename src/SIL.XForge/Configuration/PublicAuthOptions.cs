namespace SIL.XForge.Configuration;

/// <summary>
/// This class defines the authentication configuration that may be rendered on the frontend website.
/// </summary>
public class PublicAuthOptions
{
    public string Audience { get; set; }
    public string Domain { get; set; }
    public string FrontendClientId { get; set; }
    public string Scope { get; set; }
}
