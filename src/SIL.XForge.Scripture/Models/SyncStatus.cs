namespace SIL.XForge.Scripture.Models;

/// <summary>
/// The status of a sync for the <see cref="SyncMetrics"/>.
/// </summary>
public enum SyncStatus
{
    Queued,
    Running,
    Successful,
    Cancelled,
    Failed,
}
