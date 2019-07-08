using System;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models
{
    public class SFProjectEntity : ProjectEntity
    {
        public override ProjectRoles Roles => SFProjectRoles.Instance;
        public string ParatextId { get; set; }

        // Checking configuration
        public bool CheckingEnabled { get; set; }
        public bool UsersSeeEachOthersResponses { get; set; } = true;
        public bool DownloadAudioFiles { get; set; } = true;

        // Translate configuration
        public bool TranslateEnabled { get; set; }
        public string SourceParatextId { get; set; }
        public InputSystem SourceInputSystem { get; set; } = new InputSystem();

        public string ActiveSyncJobRef { get; set; }
        public DateTime LastSyncedDate { get; set; } = DateTimeOffset.FromUnixTimeSeconds(0).UtcDateTime;
    }
}
