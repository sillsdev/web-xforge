namespace SIL.XForge.Scripture.Models
{
    /// <summary>
    /// The paratext users on a project including users that do not have an sf account.
    /// </summary>
    public class ParatextUserProfile
    {
        public string Username { get; set; }
        // A unique id that can be used to associate an project component (e.g. a note) to this paratext user
        public string OpaqueUserId { get; set; }
        public string SfUserId { get; set; }
    }
}
