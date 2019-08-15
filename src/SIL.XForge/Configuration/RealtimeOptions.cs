using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Configuration
{
    /// <summary>
    /// This class represents the configuration of the real-time service.
    /// </summary>
    public class RealtimeOptions
    {
        public string AppModuleName { get; set; }
        public int Port { get; set; } = 5003;
        public List<DocConfig> Docs { get; set; } = new List<DocConfig>
            {
                new DocConfig(RootDataTypes.Users, typeof(User))
            };
    }
}
