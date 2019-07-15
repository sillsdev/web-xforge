using System.Collections.Generic;
using SIL.XForge.Realtime;
using SIL.XForge.Utils;

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

        public IList<RealtimeDomainConfig> Domains { get; } = new List<RealtimeDomainConfig>();

        public IList<ObjectPath> ImmutableProperties { get; } = new List<ObjectPath>();
    }
}
