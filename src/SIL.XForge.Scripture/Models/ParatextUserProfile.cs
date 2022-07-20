namespace SIL.XForge.Scripture.Models
{
    /// <summary>
    /// Describes a Paratext user on a project (those with and without an SF account)
    /// </summary>
    public class ParatextUserProfile
    {
        /// <summary> The user's Paratext username </summary>
        public string Username { get; set; }

        /// <summary>
        /// A unique id that can be used to associate a project component (e.g. a note) to this paratext user
        /// </summary>
        public string OpaqueUserId { get; set; }
        public string SFUserId { get; set; }
    }
}
