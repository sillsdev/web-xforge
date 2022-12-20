namespace SIL.XForge.Scripture.Models;

public class CheckingConfig
{
    public bool CheckingEnabled { get; set; }
    public bool UsersSeeEachOthersResponses { get; set; } = true;
    public bool ShareEnabled { get; set; } = false;
    public string ShareLevel { get; set; } = CheckingShareLevel.Specific;
    public string AnswerExportMethod { get; set; } = CheckingAnswerExport.MarkedForExport;
}
