using System.Collections.Generic;
using SIL.XForge.Realtime;

namespace SIL.XForge.Configuration
{
    public class DocConfig
    {
        public DocConfig(string type, string otTypeName = OTType.Json0)
        {
            Type = type;
            OTTypeName = otTypeName;
        }

        public string Type { get; }
        public string OTTypeName { get; }

        public List<DomainConfig> Domains { get; } = new List<DomainConfig>();

        public List<PathTemplateConfig> ImmutableProperties { get; } = new List<PathTemplateConfig>();
    }
}
