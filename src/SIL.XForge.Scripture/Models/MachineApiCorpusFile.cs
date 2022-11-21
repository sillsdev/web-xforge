namespace SIL.XForge.Scripture.Models
{
    /// <summary>
    /// The details of a corpus file from the Machine API.
    /// </summary>
    /// <remarks>
    /// TODO: When Machine >= 2.5.12, change any code that uses this to use DataFileDto
    /// </remarks>
    public class MachineApiCorpusFile
    {
        public string Id { get; set; } = string.Empty;
        public string LanguageTag { get; set; } = string.Empty;
        public string TextId { get; set; } = string.Empty;
    }
}
