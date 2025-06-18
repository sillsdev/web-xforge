using System;
using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// Information on each sync performed.
/// </summary>
public record SyncMetrics : IIdentifiable
{
    // Sync Details
    public DateTime? DateFinished { get; set; }
    public DateTime DateQueued { get; set; }
    public DateTime? DateStarted { get; set; }
    public string Id { get; set; }
    public string ErrorDetails { get; set; }
    public string RequiresId { get; set; }
    public string ProductVersion { get; set; }
    public string ProjectRef { get; set; }
    public SyncStatus Status { get; set; }
    public string UserRef { get; set; }

    // Sync Statistics

    /// <summary>
    /// Gets or sets the info for changes to biblical terms incoming from Paratext.
    /// </summary>
    public SyncMetricInfo BiblicalTerms { get; set; } = new SyncMetricInfo();

    /// <summary>
    /// Gets or sets the info for changes to books incoming from Paratext.
    /// </summary>
    public SyncMetricInfo Books { get; set; } = new SyncMetricInfo();

    /// <summary>
    /// Gets or sets the info for changes to notes incoming from Paratext.
    /// </summary>
    public NoteSyncMetricInfo Notes { get; set; } = new NoteSyncMetricInfo();

    /// <summary>
    /// Gets or sets the info for changes to note threads incoming from Paratext.
    /// </summary>
    public SyncMetricInfo NoteThreads { get; set; } = new SyncMetricInfo();

    /// <summary>
    /// Gets or sets the info for changes to biblical terms outgoing to Paratext.
    /// </summary>
    public SyncMetricInfo ParatextBiblicalTerms { get; set; } = new SyncMetricInfo();

    /// <summary>
    /// Gets or sets the info for changes to books outgoing to Paratext.
    /// </summary>
    public SyncMetricInfo ParatextBooks { get; set; } = new SyncMetricInfo();

    /// <summary>
    /// Gets or sets the info for changes to notes outgoing to Paratext.
    /// </summary>
    public SyncMetricInfo ParatextNotes { get; set; } = new SyncMetricInfo();

    /// <summary>
    /// Gets or sets the info for changes to questions incoming from Paratext.
    /// </summary>
    public SyncMetricInfo Questions { get; set; } = new SyncMetricInfo();

    public bool RepositoryBackupCreated { get; set; }
    public bool RepositoryRestoredFromBackup { get; set; }
    public SyncMetricInfo ResourceUsers { get; set; } = new SyncMetricInfo();
    public SyncMetricInfo TextDocs { get; set; } = new SyncMetricInfo();
    public SyncMetricInfo Users { get; set; } = new SyncMetricInfo();

    /// <summary>
    /// The log messages from <see cref="Services.ParatextSyncRunner"/>.
    /// </summary>
    public List<string> Log { get; set; } = [];

    /// <summary>
    /// Any previous syncs from the same hangfire job.
    /// </summary>
    public List<SyncMetrics>? PreviousSyncs { get; set; }
}
