using System.Collections.Generic;
using Newtonsoft.Json;
using SIL.XForge.Scripture.Services;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// A build configuration to run on Serval.
/// </summary>
/// <remarks>
/// If you add any additional properties, you must update
/// <see cref="BuildConfigJsonConverter.WriteJson(JsonWriter, BuildConfig?, JsonSerializer)" />.
/// </remarks>
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

    /// <summary>
    /// Gets or sets a value that configures the Serval build to run with a minimum number of steps.
    /// </summary>
    /// <value><c>true</c> if we ar performing a fast training build; otherwise, <c>false</c>.</value>
    /// <remarks>
    /// A fast training build will be very inaccurate. Only use this value if you are testing or debugging.
    /// </remarks>
    public bool FastTraining { get; set; } = false;
}
