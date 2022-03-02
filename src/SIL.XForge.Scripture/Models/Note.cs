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
        /// <summary>
        /// Who this note is assigned to. This may be a <see cref="ParatextUserProfile" /> OpaqueUserId,
        /// or a category such as team or unassigned.
        /// </summary>
        public string Assignment { get; set; }
    }
}
