using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models
{
    public class SyncJobEntity : ProjectDataEntity
    {
        public const string PendingState = "PENDING";
        public const string SyncingState = "SYNCING";
        public const string IdleState = "IDLE";
        public const string ErrorState = "ERROR";
        public const string CanceledState = "CANCELED";
        public static string[] ActiveStates = { PendingState, SyncingState };

        public string BackgroundJobId { get; set; }
        public string State { get; set; } = PendingState;
        public double PercentCompleted { get; set; }
    }
}
