using System.Collections.Generic;

namespace SIL.XForge.Models
{
    public abstract class Project : Json0Snapshot
    {
        public string Name { get; set; }
        public Dictionary<string, string> UserRoles { get; set; } = new Dictionary<string, string>();
        public bool SyncDisabled { get; set; }
    }
}
