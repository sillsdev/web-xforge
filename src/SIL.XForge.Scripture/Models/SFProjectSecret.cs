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
        /// The queued or active SyncMetrics Ids for the project.
        /// </summary>
        /// <value>
        /// The SyncMetrics Ids.
        /// </value>
        /// <remarks>
        /// This functions in a similar way to <see cref="JobIds"/>,
        /// so that we can mark the <see cref="SyncMetrics"/> as cancelled.
        /// </remarks>
        public List<string> SyncMetricsIds { get; set; } = new List<string>();

        /// The Machine API Translation Engine Id for the project.
        /// </summary>
        /// <value>
        /// The Translation Engine Id.
        /// </value>
        /// <remarks>
        /// The user should not interact with the translation engine directly by ID.
        /// </remarks>
        public string TranslationEngineId { get; set; }
    }
}
