namespace SIL.XForge.Models
{
    public class TestCheckingConfig : TestTaskConfig
    {
        public bool UsersSeeEachOthersResponses { get; set; } = true;
        public bool DownloadAudioFiles { get; set; } = true;
        public TestCheckingConfigShare share { get; set; } = new TestCheckingConfigShare();
    }

    public class TestCheckingConfigShare
    {
        public bool Enabled { get; set; } = true;
        public bool ViaEmail { get; set; } = true;
        // public bool ViaFacebook { get; set; } = true; (not in MVP)
    }
}
