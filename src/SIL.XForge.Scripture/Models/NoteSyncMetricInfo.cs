namespace SIL.XForge.Scripture.Models;

/// <summary>
/// Information on the operations performed when syncing the notes subsystem.
/// </summary>
/// <remarks>This is to be used with <see cref="SyncMetrics"/>.</remarks>
public record NoteSyncMetricInfo : SyncMetricInfo
{
    public NoteSyncMetricInfo() { }

    public NoteSyncMetricInfo(int added, int deleted, int updated, int removed) : base(added, deleted, updated) =>
        Removed = removed;

    public int Removed { get; set; }

    public static NoteSyncMetricInfo operator +(NoteSyncMetricInfo a, NoteSyncMetricInfo b)
    {
        if (a is null || b is null)
        {
            return a ?? b;
        }

        return new NoteSyncMetricInfo
        {
            Added = a.Added + b.Added,
            Deleted = a.Deleted + b.Deleted,
            Updated = a.Updated + b.Updated,
            Removed = a.Removed + b.Removed,
        };
    }
}
