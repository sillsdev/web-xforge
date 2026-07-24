#nullable disable warnings
namespace SIL.XForge.Configuration;

public class ParatextOptions
{
    public string ClientId { get; set; } = "client_id";
    public string ClientSecret { get; set; } = "client_secret";
    public string HgExe { get; set; }
    public string ResourcePasswordBase64 { get; set; }
    public string ResourcePasswordHash { get; set; }

    /// <summary>
    /// Optional overrides for the Paratext ecosystem server URIs, used to point the app at local
    /// mock services. When unset, the environment-based defaults in ParatextService apply.
    /// SendReceiveServerUri must contain "api94" (ParatextData checks for it);
    /// RegistryServerUri must not have a trailing slash ("/api8/" is appended to it).
    /// </summary>
    public string SendReceiveServerUri { get; set; }
    public string RegistryServerUri { get; set; }
    public string DblServerUri { get; set; }

    /// <summary>
    /// When true, the app is running against local mock services. Relaxes checks that depend on
    /// real Paratext infrastructure the mocks cannot reproduce — notably project-license RSA
    /// signatures, which are signed by Paratext's private key. Never set in production.
    /// </summary>
    public bool MockServicesEnabled { get; set; }
}
