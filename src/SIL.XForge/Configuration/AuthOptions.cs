namespace SIL.XForge.Configuration
{
    /// <summary>
    /// This class defines the authentication configuration.
    /// </summary>
    public class AuthOptions
    {
        public string Domain { get; set; }
        public string FrontendClientId { get; set; } = "frontend_client_id";
        public string BackendClientId { get; set; } = "backend_client_id";
        public string BackendClientSecret { get; set; } = "client_secret";
        public string PushUsername { get; set; } = "push_username";
        public string PushPassword { get; set; } = "push_password";
    }
}
