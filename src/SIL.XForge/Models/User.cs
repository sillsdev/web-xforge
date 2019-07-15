using System;
using System.Collections.Generic;

namespace SIL.XForge.Models
{
    public class User : RealtimeDocEntity
    {
        public string Name { get; set; }
        public string Email { get; set; }
        public string Role { get; set; }
        public string AvatarUrl { get; set; }
        public string ParatextId { get; set; }
        public bool IsNameConfirmed { get; set; }
        public string MobilePhone { get; set; }

        /// <summary>
        /// The allowable values for this property are defined in <see cref="ContactMethod" />.
        /// </summary>
        public string ContactMethod { get; set; }
        public DateTime? Birthday { get; set; }
        public string Gender { get; set; }
        public string AuthId { get; set; }
        public Dictionary<string, Site> Sites { get; set; } = new Dictionary<string, Site>();
    }
}
