using SIL.XForge.Utils;

namespace SIL.XForge.Configuration
{
    public class RealtimeDomainConfig
    {
        public RealtimeDomainConfig(int domain)
        {
            Domain = domain;
        }

        public int Domain { get; }

        public ObjectPath PathTemplate { get; set; }
    }
}
