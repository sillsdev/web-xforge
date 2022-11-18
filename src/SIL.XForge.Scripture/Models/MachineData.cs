using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models
{
    /// <summary>
    /// Machine API Data
    /// </summary>
    public class MachineData
    {
        /// <summary>
        /// Gets or sets the Machine API Corpus Id for the project.
        /// </summary>
        /// <value>
        /// The Corpus Id.
        /// </value>
        public string? CorpusId { get; set; }

        /// <summary>
        /// Gets or sets the Machine API Translation Engine Id for the project.
        /// </summary>
        /// <value>
        /// The Translation Engine Id.
        /// </value>
        /// <remarks>
        /// The user should not interact with the translation engine directly by ID.
        /// </remarks>
        public string TranslationEngineId { get; set; } = string.Empty;

        /// <summary>
        /// Gets or sets the files uploaded to the Machine API.
        /// </summary>
        /// <value>
        /// The machine corpus files.
        /// </value>
        public List<MachineCorpusFile> Files { get; set; } = new List<MachineCorpusFile>();
    }
}
