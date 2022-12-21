using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

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
