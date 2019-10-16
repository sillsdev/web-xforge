namespace SIL.XForge.Scripture.Models
{
    public class ParatextProject
    {
        public string ParatextId { get; set; }
        public string Name { get; set; }
        public string ShortName { get; set; }
        public string LanguageTag { get; set; }
        public string ProjectId { get; set; }
        public bool IsConnectable { get; set; }
        public bool IsConnected { get; set; }
        public bool IsRightToLeft { get; set; }
    }
}
