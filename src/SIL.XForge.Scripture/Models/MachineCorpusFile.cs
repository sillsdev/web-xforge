namespace SIL.XForge.Scripture.Models
{
    /// <summary>
    /// The details of a corpus file stored on the Machine API .
    /// </summary>
    public class MachineCorpusFile
    {
        public string FileChecksum { get; set; }
        public string FileId { get; set; }
        public string LanguageTag { get; set; }
        public string TextId { get; set; }
    }
}
