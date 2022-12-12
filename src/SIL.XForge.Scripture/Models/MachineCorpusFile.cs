namespace SIL.XForge.Scripture.Models
{
    /// <summary>
    /// The details of a corpus file stored on the Machine API.
    /// </summary>
    public class MachineCorpusFile
    {
        /// <summary>
        /// The MD5 Hash of the corpus file's contents.
        /// This is used to see if the file has changed since its last upload to the Machine API.
        /// </summary>
        public string FileChecksum { get; set; } = string.Empty;
        public string FileId { get; set; } = string.Empty;
        public string LanguageTag { get; set; } = string.Empty;
        public string TextId { get; set; } = string.Empty;
    }
}
