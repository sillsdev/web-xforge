using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// Serval Data.
/// </summary>
public class ServalData
{
    /// <summary>
    /// Gets or sets the Serval Translation Engine Id for the project.
    /// </summary>
    /// <value>
    /// The Translation Engine Id.
    /// </value>
    /// <remarks>
    /// The user should not interact with the translation engine directly by ID.
    /// </remarks>
    public string TranslationEngineId { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the corpora uploaded to Serval.
    /// </summary>
    /// <value>
    /// The machine corpora.
    /// </value>
    /// <remarks>
    /// The dictionary key is the corpus ID.
    /// </remarks>
    public Dictionary<string, ServalCorpus> Corpora { get; set; } = new Dictionary<string, ServalCorpus>();
}
