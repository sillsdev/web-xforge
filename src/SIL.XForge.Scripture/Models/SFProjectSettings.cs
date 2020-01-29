namespace SIL.XForge.Scripture.Models
{
    /// <summary>
    /// This class represents the project settings that can be updated using
    /// <see cref="SIL.XForge.Scripture.Controllers.SFProjectsRpcController.UpdateSettings"/>.
    /// </summary>
    public class SFProjectSettings
    {
        // translate settings
        public bool? TranslationSuggestionsEnabled { get; set; }

        public string SourceParatextId { get; set; }

        // checking settings
        public bool? CheckingEnabled { get; set; }

        public bool? UsersSeeEachOthersResponses { get; set; }

        public bool? DownloadAudioFiles { get; set; }

        public bool? ShareEnabled { get; set; }

        public string ShareLevel { get; set; }
    }
}
