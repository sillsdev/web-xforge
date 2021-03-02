using System;

namespace SIL.XForge.Models
{
    public class ShareKey
    {
        public string Email { get; set; }
        public string Key { get; set; }
        // Use a default expiration time for sharekeys without an expiration (sharekeys created prior to SF-753)
        public DateTime? ExpirationTime { get; set; } = new DateTime(2021, 12, 1, 0, 0, 0, DateTimeKind.Utc);
        public string ProjectRole { get; set; }
    }
}
