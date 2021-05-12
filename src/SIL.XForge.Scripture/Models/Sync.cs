using System;

namespace SIL.XForge.Scripture.Models
{
    public class Sync
    {
        public int QueuedCount { get; set; }
        public double? PercentCompleted { get; set; }
        public bool? LastSyncSuccessful { get; set; }
        public DateTime? DateLastSuccessfulSync { get; set; }
        public string SyncedToRepositoryVersion { get; set; }
        public bool? DataInSync { get; set; }
    }
}
