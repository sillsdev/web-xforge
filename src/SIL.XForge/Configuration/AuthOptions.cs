namespace SIL.XForge.Configuration
{
    /// <summary>
    /// This class defines the authentication configuration.
    /// </summary>
    public class AuthOptions
    {
        public string Domain { get; set; }
        public string Audience { get; set; }
        public string ManagementAudience { get; set; }
        public string Scope { get; set; }
        public string FrontendClientId { get; set; }
        public string BackendClientId { get; set; }
        public string BackendClientSecret { get; set; }
        public string WebhookUsername { get; set; }
        public string WebhookPassword { get; set; }
    }
}
