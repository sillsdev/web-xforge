namespace SIL.XForge.Configuration
{
    public class RealtimeDomainConfig
    {
        public RealtimeDomainConfig(int domain)
        {
            Domain = domain;
        }

        public int Domain { get; }

        public PathTemplateConfig PathTemplate { get; set; }
    }
}
