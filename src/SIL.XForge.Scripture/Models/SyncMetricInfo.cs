namespace SIL.XForge.Scripture.Models
{
    /// <summary>
    /// Information on the operations performed when syncing a subsystem.
    /// </summary>
    /// <remarks>This is to be used with <see cref="SyncMetrics"/>.</remarks>
    public class SyncMetricInfo
    {
        public int Added { get; set; }
        public int Deleted { get; set; }
        public int Updated { get; set; }

        public static SyncMetricInfo operator +(SyncMetricInfo a, SyncMetricInfo b) =>
            new SyncMetricInfo
            {
                Added = a.Added + b.Added,
                Deleted = a.Deleted + b.Deleted,
                Updated = a.Updated + b.Updated,
            };
    }
}
