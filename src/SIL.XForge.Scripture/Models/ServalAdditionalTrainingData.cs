using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// Serval Configuration for Additional Training Data.
/// </summary>
public class ServalAdditionalTrainingData
{
    /// <summary>
    /// Gets or sets the Parallel Corpus identifier.
    /// </summary>
    public string ParallelCorpusId { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the identifier of the corpus to be used as the source in the Parallel Corpus.
    /// </summary>
    public string SourceCorpusId { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the identifier of the corpus to be used as the target in the Parallel Corpus.
    /// </summary>
    public string TargetCorpusId { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the corpus files uploaded to Serval.
    /// </summary>
    /// <value>
    /// The files in both the source and target corpora.
    /// </value>
    public List<ServalCorpusFile> CorpusFiles { get; set; } = [];
}
