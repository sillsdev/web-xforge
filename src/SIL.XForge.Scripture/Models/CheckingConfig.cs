namespace SIL.XForge.Scripture.Models
{
    public class CheckingConfig
    {
        public bool CheckingEnabled { get; set; }
        public bool UsersSeeEachOthersResponses { get; set; } = true;
        public bool ShareEnabled { get; set; } = false;

        // TODO: Migrate to remove this from every project
        public string ShareLevel { get; set; }
        public string AnswerExportMethod { get; set; } = CheckingAnswerExport.All;
    }
}
