using System;

namespace SIL.XForge.Scripture.Models
{
    /// <summary>
    /// A build job from the Machine API.
    /// </summary>
    /// <remarks>
    /// TODO: When machine is upgraded, replace this class with the Build class.
    /// </remarks>
    public class MachineBuildJob
    {
        public DateTime? DateFinished { get; set; }
        public string Id { get; set; } = string.Empty;
        public string? Message { get; set; }
        public double PercentCompleted { get; set; }
        public int Revision { get; set; }
        public string State { get; set; } = string.Empty;
        public int Step { get; set; }
    }
}
