namespace SIL.XForge.Scripture.Models
{
    using System.Collections.Generic;

    /// <summary>
    /// Machine API Corpus Data.
    /// </summary>
    public class MachineCorpus
    {
        /// <summary>
        /// Gets or sets the files uploaded to the Machine API.
        /// </summary>
        /// <value>
        /// The machine corpus files.
        /// </value>
        public List<MachineCorpusFile> Files { get; set; } = new List<MachineCorpusFile>();
    }
}
