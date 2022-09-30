using System;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models
{
    /// <summary>
    /// Information on each sync performed.
    /// </summary>
    public class SyncMetrics : IIdentifiable
    {
        public DateTime? DateFinished { get; set; }
        public DateTime DateQueued { get; set; }
        public DateTime? DateStarted { get; set; }
        public string Id { get; set; }
        public string ErrorDetails { get; set; }
        public string RequiresId { get; set; }
        public string ProjectRef { get; set; }
        public SyncStatus Status { get; set; }
        public string UserRef { get; set; }
    }
}
