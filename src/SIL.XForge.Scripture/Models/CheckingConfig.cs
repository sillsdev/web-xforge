using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models
{
    public class CheckingConfig : TaskConfig
    {
        public bool UsersSeeEachOthersResponses { get; set; } = true;
        public bool DownloadAudioFiles { get; set; } = true;
        public ShareConfig Share { get; set; } = new ShareConfig();
    }
}
