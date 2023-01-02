namespace SIL.XForge.Scripture.Models
{
    public class ProgressState
    {
        public static readonly ProgressState Completed = new ProgressState { ProgressValue = 1.0 };
        public static readonly ProgressState NotStarted = new ProgressState { ProgressValue = 0.0 };
        public string? ProgressString { get; set; }
        public double ProgressValue { get; set; }
    }
}
