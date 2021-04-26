namespace SIL.XForge.Scripture.Models
{
    public class Note : Comment
    {
        public string ThreadId { get; set; }
        public string Content { get; set; }
        public string ExtUserId { get; set; }
        public bool Deleted { get; set; }
        public string TagIcon { get; set; }
    }
}
