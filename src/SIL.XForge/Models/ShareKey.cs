using System;

namespace SIL.XForge.Models
{
    public class ShareKey
    {
        public string? Email { get; set; }
        public string Key { get; set; }
        public DateTime? ExpirationTime { get; set; }
        public string ShareLinkType { get; set; }
        public string ProjectRole { get; set; }
        public string? RecipientUserId { get; set; }

        /// <summary>
        /// Determines if a one time, recipient only, share link has been shared which requires the key to be reserved
        /// only for that link. Any new one time, recipient only, share links required will generate a new share key
        /// </summary>
        public bool? Reserved { get; set; }
    }
}
