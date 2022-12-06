using SIL.Machine.WebApi;

namespace SIL.XForge.Scripture.Models
{
    /// <summary>
    /// The details of a translation engine from the Machine API.
    /// </summary>
    /// <remarks>
    /// TODO: When Machine >= 2.5.X, change any code that uses this to use TranslationEngineDto
    /// </remarks>
    public class MachineApiTranslationEngine : ResourceDto
    {
        public string Name { get; set; } = string.Empty;

        public string SourceLanguageTag { get; set; } = string.Empty;

        public string TargetLanguageTag { get; set; } = string.Empty;

        public string Type { get; set; } = string.Empty;
        public bool IsBuilding { get; set; }
        public int ModelRevision { get; set; }
        public double Confidence { get; set; }
        public int CorpusSize { get; set; }
    }
}
