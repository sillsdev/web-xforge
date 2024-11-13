namespace SIL.XForge.Scripture.Models;

public class CheckingConfig
{
    public bool CheckingEnabled { get; set; }
    public bool UsersSeeEachOthersResponses { get; set; } = true;
    public string AnswerExportMethod { get; set; } = CheckingAnswerExport.All;
    public int? NoteTagId { get; set; }

    /// <summary>Do not show chapter text in community checking area (i.e. only audio should be shown)</summary>
    public bool? HideCommunityCheckingText { get; set; }
}
