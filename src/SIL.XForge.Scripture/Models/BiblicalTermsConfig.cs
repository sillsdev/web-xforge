namespace SIL.XForge.Scripture.Models;

/// <summary>
/// Contains configuration information for Biblical Terms and Renderings.
/// </summary>
public class BiblicalTermsConfig
{
    public bool BiblicalTermsEnabled { get; set; }
    public string? ErrorMessage { get; set; }
    public bool HasRenderings { get; set; }
}
