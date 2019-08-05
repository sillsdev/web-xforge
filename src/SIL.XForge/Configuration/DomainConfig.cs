namespace SIL.XForge.Configuration
{
    /// <summary>
    /// This class represents the configuration of a access-control domain in a real-time document.
    /// </summary>
    public class DomainConfig
    {
        public DomainConfig(int domain)
        {
            Domain = domain;
        }

        public int Domain { get; }

        public PathTemplateConfig PathTemplate { get; set; }
    }
}
