namespace SIL.XForge.Configuration
{
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
