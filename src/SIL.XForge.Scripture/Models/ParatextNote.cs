namespace SIL.XForge.Scripture.Models
{
    public class ParatextNote : Comment
    {
        public string ThreadId { get; set; }
        public string Content { get; set; }
        public string ExtUserId { get; set; }
        public int VersionNumber { get; set; }
        public bool Deleted { get; set; }
        public string TagIcon { get; set; }
        public int StartPosition { get; set; }
    }
}
