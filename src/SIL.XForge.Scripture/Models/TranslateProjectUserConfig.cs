namespace SIL.XForge.Scripture.Models
{
    public class TranslateProjectUserConfig
    {
        public bool IsTargetTextRight { get; set; } = true;
        public double ConfidenceThreshold { get; set; } = 0.2;
        public bool IsSuggestionsEnabled { get; set; } = true;
        public string SelectedBookId { get; set; }
        public int SelectedChapter { get; set; }
        public string SelectedSegment { get; set; } = "";
        public int? SelectedSegmentChecksum { get; set; }
    }
}
