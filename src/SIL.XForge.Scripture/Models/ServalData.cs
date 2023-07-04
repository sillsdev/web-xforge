using System;
using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// Serval Data.
/// </summary>
public class ServalData
{
    /// <summary>
    /// Gets or sets the SMT Translation Engine Id for the project.
    /// </summary>
    /// <value>
    /// The SMT Translation Engine Id.
    /// </value>
    /// <remarks>
    /// The user should not interact with the translation engine directly by ID.
    /// </remarks>
    public string? TranslationEngineId { get; set; }

    /// <summary>
    /// Gets or sets the NMT Translation Engine Id for the project.
    /// </summary>
    /// <value>
    /// The NMT Translation Engine Id.
    /// </value>
    public string? PreTranslationEngineId { get; set; }

    /// <summary>
    /// Gets or sets the date and time that the pre-translation build was queued.
    /// </summary>
    /// <value>
    /// The date and time in UTC that the pre-translation build was queued;
    /// otherwise, null if the build has started on Serval or is not running.
    /// </value>
    /// <remarks>
    /// This is used to keep track of whether a build and its corpus is currently uploading to Serval.
    /// If this is longer than 6 hours ago (UTC), there will have been a crash, so an error should be reported.
    /// </remarks>
    public DateTime? PreTranslationQueuedAt { get; set; }

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
