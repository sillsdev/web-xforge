using System.Collections.Generic;

namespace SIL.XForge.Configuration
{
    public class RealtimeDocConfig
    {
        public RealtimeDocConfig(string type, string otTypeName)
        {
            Type = type;
            OTTypeName = otTypeName;
        }

        public string Type { get; }
        public string OTTypeName { get; }

        public IList<RealtimeModelConfig> Models { get; } = new List<RealtimeModelConfig>();
    }
}
