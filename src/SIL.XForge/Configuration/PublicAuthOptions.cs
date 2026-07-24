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

    /// <summary>
    /// The OIDC authority/issuer URL derived from <see cref="Domain"/>, always with a trailing
    /// slash. Domain is normally a bare hostname (https is assumed), but may be a full http(s)
    /// URL, optionally with a path, to point the app at a local mock auth server.
    /// </summary>
    public string Authority =>
        (Domain.StartsWith("http://") || Domain.StartsWith("https://") ? Domain : $"https://{Domain}").TrimEnd('/')
        + "/";
}
