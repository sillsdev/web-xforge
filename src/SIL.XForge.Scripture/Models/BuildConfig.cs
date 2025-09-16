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
    /// Gets or sets the DataIds of the files to use for training.
    /// </summary>
    /// <value>The DataIds of the files to use as for training.</value>
    public HashSet<string> TrainingDataFiles { get; set; } = [];

    /// <summary>
    /// Gets or sets the per-project books and chapters to use for training.
    /// </summary>
    /// <value>
    /// A list containing the project identifiers and scripture ranges.
    /// </value>
    public HashSet<ProjectScriptureRange> TrainingScriptureRanges { get; set; } = [];

    /// <summary>
    /// Gets or sets the per-project books and chapters to use for translation.
    /// </summary>
    /// <value>
    /// A list containing the project identifiers and scripture ranges.
    /// </value>
    public HashSet<ProjectScriptureRange> TranslationScriptureRanges { get; set; } = [];

    /// <summary>
    /// Gets or sets the project identifier.
    /// </summary>
    /// <value>The Scripture Forge project identifier.</value>
    public string ProjectId { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets a value that configures the Serval build to run with a minimum number of steps.
    /// </summary>
    /// <value><c>true</c> if we are performing a fast training build; otherwise, <c>false</c>.</value>
    /// <remarks>
    /// A fast training build will be very inaccurate. Only use this value if you are testing or debugging.
    /// </remarks>
    public bool FastTraining { get; set; }

    /// <summary>
    /// Gets or sets a value that configures the Serval build to use the Echo translation engine
    /// </summary>
    /// <value><c>true</c> if we are using the echo translation engine; otherwise, <c>false</c>.</value>
    /// <remarks>
    /// A build made using echo will just echo the source text. Only use this value if you are testing or debugging.
    /// </remarks>
    public bool UseEcho { get; set; }

    /// <summary>
    /// Gets or sets a value that specifies whether to send an email when the build is finished.
    /// </summary>
    /// <value><c>true</c> if we are sending an email when the build finishes; otherwise, <c>false</c>.</value>
    public bool SendEmailOnBuildFinished { get; set; }
}
