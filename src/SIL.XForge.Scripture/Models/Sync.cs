using System;

namespace SIL.XForge.Scripture.Models
{
    public class Sync
    {
        public int QueuedCount { get; set; }
        public double? PercentCompleted { get; set; }
        public bool? LastSyncSuccessful { get; set; }
        public DateTime? DateLastSuccessfulSync { get; set; }
        /// <summary>
        /// The SF project was last successfully synchronized with PT project data at this repository
        /// commit on the PT project send/receive server.
        /// </summary>
        public string SyncedToRepositoryVersion { get; set; }
        public bool? DataInSync { get; set; }
    }
}
