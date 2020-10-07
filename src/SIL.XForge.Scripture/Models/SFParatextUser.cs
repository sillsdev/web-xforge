using Paratext.Data.Users;

namespace SIL.XForge.Scripture.Models
{
    /// <summary>
    /// SF customization of ParatextUser
    /// </summary>
    public class SFParatextUser : ParatextUser
    {
        public SFParatextUser(string ptUsername) : base(ptUsername, true)
        { }
    }
}
