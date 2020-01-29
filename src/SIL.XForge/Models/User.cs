using System.Collections.Generic;

namespace SIL.XForge.Models
{
    public class User : Json0Snapshot
    {
        public string Name { get; set; }

        public string Email { get; set; }

        public string Role { get; set; }

        public string AvatarUrl { get; set; }

        public string ParatextId { get; set; }

        public string DisplayName { get; set; }

        public bool IsDisplayNameConfirmed { get; set; }

        public string InterfaceLanguage { get; set; }

        public string AuthId { get; set; }

        public Dictionary<string, Site> Sites { get; set; } = new Dictionary<string, Site>();
    }
}
