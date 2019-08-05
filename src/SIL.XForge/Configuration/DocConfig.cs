using System;
using System.Collections.Generic;
using SIL.XForge.Realtime;

namespace SIL.XForge.Configuration
{
    /// <summary>
    /// This class represents the configuration of a real-time document type.
    /// </summary>
    public class DocConfig
    {
        public DocConfig(string rootDataType, string otTypeName = OTType.Json0)
        {
            RootDataType = rootDataType;
            OTTypeName = otTypeName;
        }

        public string RootDataType { get; }
        public string OTTypeName { get; }
        public Type Type { get; set; }
        public List<DomainConfig> Domains { get; } = new List<DomainConfig>();

        public List<PathTemplateConfig> ImmutableProperties { get; } = new List<PathTemplateConfig>();
    }
}
