using System.Collections.Generic;
using Newtonsoft.Json;
using SIL.XForge.Scripture.Services;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// A build configuration to run on Serval.
/// </summary>
[JsonConverter(typeof(BuildConfigJsonConverter))]
public class BuildConfig
{
    /// <summary>
    /// Gets or sets the books to use for training the draft.
    /// </summary>
    /// <value>The books numbers to use as the source texts for training.</value>
    public HashSet<int> TrainingBooks { get; set; } = new HashSet<int>();

    /// <summary>
    /// Gets or sets the books to use for translation.
    /// </summary>
    /// <value>The books numbers to use as the source texts for training.</value>
    public HashSet<int> TranslationBooks { get; set; } = new HashSet<int>();

    /// <summary>
    /// Gets or sets the project identifier.
    /// </summary>
    /// <value>The Scripture Forge project identifier.</value>
    public string ProjectId { get; set; } = string.Empty;
}
