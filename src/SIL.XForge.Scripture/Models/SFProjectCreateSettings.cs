namespace SIL.XForge.Scripture.Models;

public class SFProjectCreateSettings
{
    public string ParatextId { get; set; }
    public bool TranslationSuggestionsEnabled { get; set; }
    public string SourceParatextId { get; set; }
    public bool CheckingEnabled { get; set; }
    public string AnswerExportMethod { get; set; } = CheckingAnswerExport.MarkedForExport;
}
