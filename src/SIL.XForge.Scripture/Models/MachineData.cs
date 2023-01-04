using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// Machine API Data
/// </summary>
public class MachineData
{
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
    /// Gets or sets the corpora uploaded to the Machine API.
    /// </summary>
    /// <value>
    /// The machine corpora.
    /// </value>
    /// <remarks>
    /// The dictionary key is the corpus ID.
    /// </remarks>
    public Dictionary<string, MachineCorpus> Corpora { get; set; } = new Dictionary<string, MachineCorpus>();
}
