namespace SIL.XForge.Scripture.Models;

/// <summary>
/// Serval Corpus Synchronization Information.
/// </summary>
/// <remarks>
/// This class is used by <see cref="Services.MachineProjectService.SyncProjectCorporaAsync"/>
/// to determine the pre-translate and train on corpus configuration.
/// </remarks>
public class ServalCorpusSyncInfo
{
    /// <summary>
    /// Gets or sets the corpus that was synchronized.
    /// </summary>
    public string CorpusId { get; init; } = string.Empty;

    /// <summary>
    /// Gets or sets whether this corpus is a source corpus.
    /// </summary>
    /// <value><c>true</c> if a source corpus; otherwise, </value>
    public bool IsSource { get; init; }

    /// <summary>
    /// Gets or sets the identifier of the parallel corpus
    /// that was synchronized for this corpus.
    /// </summary>
    public string ParallelCorpusId { get; init; } = string.Empty;

    /// <summary>
    /// Gets or sets the project that was synchronized for this corpus.
    /// </summary>
    public string ProjectId { get; init; } = string.Empty;
}
