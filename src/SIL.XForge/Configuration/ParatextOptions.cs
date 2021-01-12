namespace SIL.XForge.Configuration
{
    public class ParatextOptions
    {
        public string ClientId { get; set; } = "client_id";
        public string ClientSecret { get; set; } = "client_secret";
        public string HgExe { get; set; }
        public string ResourcePasswordBase64 { get; set; }
        public string ResourcePasswordHash { get; set; }
    }
}
