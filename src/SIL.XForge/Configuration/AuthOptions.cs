namespace SIL.XForge.Configuration
{
    public class AuthOptions
    {
        public string Domain { get; set; }
        public string FrontendClientId { get; set; } = "client_id";
        public string BackendClientId { get; set; } = "client_id";
        public string BackendClientSecret { get; set; } = "client_secret";
        public string PushUsername { get; set; } = "push_username";
        public string PushPassword { get; set; } = "push_password";
    }
}
