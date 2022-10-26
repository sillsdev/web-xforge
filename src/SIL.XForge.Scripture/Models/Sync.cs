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
        public string? SyncedToRepositoryVersion { get; set; }

        /// <summary>
        /// If the local PT repo has been imported into SF DB.
        /// <br />
        /// More specifically:<br />
        /// True if the the local PT project repository's commit that
        /// is the most recent commit from the last push or pull with the PT SR server (see
        /// <see cref="HgWrapper.GetLastPublicRevision()"/>), has a commit id that matches
        /// <see cref="SyncedToRepositoryVersion"/>, meaning a sync brought the SF DB up to date by absorbing the
        /// contents of the local PT project hg repository at that commit id.<br />
        /// The SF DB may have been modified since then. And the *remote* PT SR server hg repository may have received
        /// more information since then. And the most recent attempt to sync may or may not have been successful. But
        /// this property can still be true in those situations.
        /// <br />
        /// False if the local PT repo's <see cref="HgWrapper.GetLastPublicRevision()"/> does not match
        /// <see cref="SyncedToRepositoryVersion"/>. This situation may arise from crashing during sync, with no
        /// successful local PT repo rollback, in which case the local PT repo would have been changed, but we have no
        /// record of successfully importing all local PT repo data into SF DB at the new commit id.
        /// </summary>
        public bool? DataInSync { get; set; }
    }
}
