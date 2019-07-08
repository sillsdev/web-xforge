using JsonApiDotNetCore.Models;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models
{
    public class SFProjectResource : ProjectResource
    {
        [Attr(isImmutable: true)]
        public string ParatextId { get; set; }

        // Checking configuration
        [Attr]
        public bool CheckingEnabled { get; set; }
        [Attr]
        public bool UsersSeeEachOthersResponses { get; set; }
        [Attr]
        public bool DownloadAudioFiles { get; set; }

        // Translate configuration
        [Attr]
        public bool TranslateEnabled { get; set; }
        [Attr]
        public string SourceParatextId { get; set; }
        [Attr(isFilterable: false, isSortable: false)]
        public InputSystem SourceInputSystem { get; set; } = new InputSystem();
    }
}
