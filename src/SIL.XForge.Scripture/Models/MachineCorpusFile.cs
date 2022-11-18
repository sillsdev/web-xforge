namespace SIL.XForge.Scripture.Models
{
    /// <summary>
    /// The details of a corpus file stored on the Machine API.
    /// </summary>
    public class MachineCorpusFile
    {
        public string FileChecksum { get; set; } = string.Empty;
        public string FileId { get; set; } = string.Empty;
        public string LanguageTag { get; set; } = string.Empty;
        public string TextId { get; set; } = string.Empty;
    }
}
