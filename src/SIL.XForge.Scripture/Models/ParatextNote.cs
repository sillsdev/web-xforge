using System;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models
{
    public class ParatextNote : Comment
    {
        public string ThreadId { get; set; }
        public string ParatextUser { get; set; }
        public string Content { get; set; }
        public string Language { get; set; }
        public string ExtUserId { get; set; }
        public int VersionNumber { get; set; }
        public bool Deleted { get; set; }
    }
}
