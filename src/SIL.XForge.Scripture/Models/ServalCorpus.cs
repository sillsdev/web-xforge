using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// Serval Corpus Data.
/// </summary>
public class ServalCorpus
{
    /// <summary>
    /// Gets or sets a value indicating whether or not this corpus is for pre-translation.
    /// </summary>
    /// <value>
    /// <c>true</c> if this corpus is for pre-translation; otherwise, <c>false</c>.
    /// </value>
    public bool PreTranslate { get; set; }

    /// <summary>
    /// Gets or sets the source files uploaded to Serval.
    /// </summary>
    /// <value>
    /// The source corpus files.
    /// </value>
    public List<ServalCorpusFile> SourceFiles { get; set; } = new List<ServalCorpusFile>();

    /// <summary>
    /// Gets or sets the target files uploaded to Serval.
    /// </summary>
    /// <value>
    /// The target corpus files.
    /// </value>
    public List<ServalCorpusFile> TargetFiles { get; set; } = new List<ServalCorpusFile>();
}
