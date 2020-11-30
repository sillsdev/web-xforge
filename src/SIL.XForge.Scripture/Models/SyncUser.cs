namespace SIL.XForge.Scripture.Models
{
    /// <summary>
    /// This class represents a Paratext username that was used to sync notes with Paratext.
    /// </summary>
    public class SyncUser
    {
        /// <summary>
        /// Unique id of a SyncUser. Not intended to match a user id.
        /// </summary>
        public string Id { get; set; }
        public string ParatextUsername { get; set; }
    }
}
