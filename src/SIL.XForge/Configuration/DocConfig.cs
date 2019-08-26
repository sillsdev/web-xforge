using System;
using SIL.XForge.Realtime;

namespace SIL.XForge.Configuration
{
    /// <summary>
    /// This class represents the configuration of a real-time document type.
    /// </summary>
    public class DocConfig
    {
        public DocConfig(string collectionName, Type type, string otTypeName = OTType.Json0)
        {
            CollectionName = collectionName;
            Type = type;
            OTTypeName = otTypeName;
        }

        public string CollectionName { get; }
        public Type Type { get; }
        public string OTTypeName { get; }
    }
}
