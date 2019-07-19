using System.Collections.Generic;
using Newtonsoft.Json;

namespace SIL.XForge.Models
{
    public abstract class Project : Json0Snapshot
    {
        public string ProjectName { get; set; }
        public InputSystem InputSystem { get; set; } = new InputSystem();
        public Dictionary<string, string> UserRoles { get; set; } = new Dictionary<string, string>();
        public bool ShareEnabled { get; set; } = true;
        public string ShareLevel { get; set; } = SharingLevel.Specific;

        [JsonIgnore]
        public abstract ProjectRoles Roles { get; }

        public bool HasRight(string userId, Right right)
        {
            if (UserRoles.TryGetValue(userId, out string role))
                return Roles.Rights[role].Contains(right);
            return false;
        }
    }
}
