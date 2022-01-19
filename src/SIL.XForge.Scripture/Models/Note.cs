namespace SIL.XForge.Scripture.Models
{
    public class Note : Comment
    {
        public string ThreadId { get; set; }
        public string Content { get; set; }
        public string ExtUserId { get; set; }
        public bool Deleted { get; set; }
        public string Status { get; set; }
        public string TagIcon { get; set; }
        public string Reattached { get; set; }
        public string AssignedUserRef { get; set; }
        public string AssignedPTUsername { get; set; }
    }
}
