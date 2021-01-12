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
        public bool MigrationsDisabled = false;
        public DocConfig UserDoc { get; set; } = new DocConfig("users", typeof(User));
        public DocConfig ProjectDoc { get; set; }
        public List<DocConfig> ProjectDataDocs { get; set; } = new List<DocConfig>();
    }
}
