using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models
{
    public class SFProjectSecret : ProjectSecret
    {
        /// <summary>
        /// The queued or active Hangfire Job Ids for the project.
        /// </summary>
        /// <value>
        /// The Hangfire Job Ids.
        /// </value>
        /// <remarks>
        /// The <see cref="List{T}.Count">Count</see> should correspond to <see cref="QueuedCount" />.
        /// </remarks>
        public List<string> JobIds { get; set; } = new List<string>();

        /// <summary>
        /// Keeps track of all Paratext usernames that have been used to sync notes with Paratext
        /// </summary>
        public List<SyncUser> SyncUsers { get; set; } = new List<SyncUser>();
    }
}
