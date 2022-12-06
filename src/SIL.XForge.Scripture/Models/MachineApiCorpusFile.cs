using SIL.Machine.WebApi;

namespace SIL.XForge.Scripture.Models
{
    /// <summary>
    /// The details of a corpus file from the Machine API.
    /// </summary>
    /// <remarks>
    /// TODO: When Machine >= 2.5.X, change any code that uses this to use DataFileDto
    /// </remarks>
    public class MachineApiCorpusFile : ResourceDto
    {
        public ResourceDto? Corpus { get; set; }
        public string Name { get; set; } = string.Empty;
        public string LanguageTag { get; set; } = string.Empty;
        public string TextId { get; set; } = string.Empty;
    }
}
