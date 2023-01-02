namespace SIL.XForge.Scripture.Models
{
    public class ProgressState
    {
        public static ProgressState Completed = new ProgressState { ProgressValue = 100.0 };
        public static ProgressState NotStarted = new ProgressState { ProgressValue = 0.0 };
        public string? ProgressString { get; set; }
        public double ProgressValue { get; set; }
    }
}
