namespace SIL.XForge.Models
{
    public class TestCheckingConfig : TestTaskConfig
    {
        public bool UsersSeeEachOthersResponses { get; set; } = true;
        public bool DownloadAudioFiles { get; set; } = true;
        public ShareConfig Share { get; set; } = new ShareConfig();
    }
}
