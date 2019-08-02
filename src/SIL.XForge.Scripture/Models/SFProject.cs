using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models
{
    public class SFProject : Project
    {
        public override ProjectRoles Roles => SFProjectRoles.Instance;
        public string ParatextId { get; set; }
        public List<TextInfo> Texts { get; set; } = new List<TextInfo>();
        public Sync Sync { get; set; } = new Sync();

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
