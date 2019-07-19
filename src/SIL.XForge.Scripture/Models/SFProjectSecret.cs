using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models
{
    public class SFProjectSecret : ProjectSecret
    {
        /// <summary>
        /// Keeps track of all Paratext usernames that have been used to sync notes with Paratext
        /// </summary>
        public List<SyncUser> SyncUsers { get; set; } = new List<SyncUser>();
    }
}
