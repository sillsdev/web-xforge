namespace SIL.XForge.Scripture.Models
{
    /// <summary>
    /// The details of a corpus file from the Machine API.
    /// </summary>
    public class MachineApiCorpusFile
    {
        public string Id { get; set; } = string.Empty;
        public string LanguageTag { get; set; } = string.Empty;
        public string TextId { get; set; } = string.Empty;
    }
}
