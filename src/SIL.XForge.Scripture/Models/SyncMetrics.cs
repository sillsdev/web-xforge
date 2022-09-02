using System;
using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models
{
    /// <summary>
    /// Information on each sync performed.
    /// </summary>
    public class SyncMetrics : IIdentifiable
    {
        // Sync Details
        public DateTime? DateFinished { get; set; }
        public DateTime DateQueued { get; set; }
        public DateTime? DateStarted { get; set; }
        public string Id { get; set; }
        public string ErrorDetails { get; set; }
        public string RequiresId { get; set; }
        public string ProjectRef { get; set; }
        public SyncStatus Status { get; set; }
        public string UserRef { get; set; }

        // Sync Statistics
        public SyncMetricInfo Books { get; set; } = new SyncMetricInfo();
        public SyncMetricInfo NoteThreads { get; set; } = new SyncMetricInfo();
        public SyncMetricInfo ParatextBooks { get; set; } = new SyncMetricInfo();
        public SyncMetricInfo ParatextNotes { get; set; } = new SyncMetricInfo();
        public SyncMetricInfo Questions { get; set; } = new SyncMetricInfo();
        public bool RepositoryBackupCreated { get; set; }
        public bool RepositoryRestoredFromBackup { get; set; }
        public SyncMetricInfo ResourceUsers { get; set; } = new SyncMetricInfo();
        public SyncMetricInfo TextDocs { get; set; } = new SyncMetricInfo();
        public SyncMetricInfo Users { get; set; } = new SyncMetricInfo();

        /// <summary>
        /// The log messages from <see cref="Services.ParatextSyncRunner"/>.
        /// </summary>
        public List<string> Log { get; set; } = new List<string>();
    }
}
