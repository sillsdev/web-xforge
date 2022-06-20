using System.Collections.Generic;

namespace SIL.XForge.Models
{
    public abstract class Project : Json0Snapshot
    {
        public string Name { get; set; }

        /// <summary>Dictionary of SF user id to project role</summary>
        public Dictionary<string, string> UserRoles { get; set; } = new Dictionary<string, string>();
        public Dictionary<string, string[]> UserPermissions { get; set; } = new Dictionary<string, string[]>();
        public bool SyncDisabled { get; set; }
    }
}
