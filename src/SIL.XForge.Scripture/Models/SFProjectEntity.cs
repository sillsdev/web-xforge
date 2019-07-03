using System;
using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models
{
    public class SFProjectEntity : ProjectEntity
    {
        public override ProjectRoles Roles => SFProjectRoles.Instance;
        public string ParatextId { get; set; }
        /// <summary>
        /// Keeps track of all Paratext usernames that have been used to sync notes with Paratext
        /// </summary>
        public List<SyncUser> SyncUsers { get; set; } = new List<SyncUser>();

        // checking
        public bool CheckingEnabled { get; set; }
        public bool UsersSeeEachOthersResponses { get; set; } = true;
        public bool DownloadAudioFiles { get; set; } = true;

        // translate
        public bool TranslateEnabled { get; set; }
        public string SourceParatextId { get; set; }
        public InputSystem SourceInputSystem { get; set; } = new InputSystem();
    }
}
