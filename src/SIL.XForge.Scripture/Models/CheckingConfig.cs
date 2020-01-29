namespace SIL.XForge.Scripture.Models
{
    public class CheckingConfig
    {
        public bool CheckingEnabled { get; set; }

        public bool UsersSeeEachOthersResponses { get; set; } = true;

        public bool ShareEnabled { get; set; } = true;

        public string ShareLevel { get; set; } = CheckingShareLevel.Specific;
    }
}
