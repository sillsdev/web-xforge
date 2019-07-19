using System.Collections.Generic;
using SIL.XForge.Realtime;

namespace SIL.XForge.Configuration
{
    public class RealtimeDocConfig
    {
        public RealtimeDocConfig(string type, string otTypeName = OTType.Json0)
        {
            Type = type;
            OTTypeName = otTypeName;
        }

        public string Type { get; }
        public string OTTypeName { get; }

        public List<RealtimeDomainConfig> Domains { get; } = new List<RealtimeDomainConfig>();

        public List<PathTemplateConfig> ImmutableProperties { get; } = new List<PathTemplateConfig>();
    }
}
