using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// Serval Corpus Data.
/// </summary>
public class ServalCorpus
{
    /// <summary>
    /// Gets or sets a value indicating whether this corpus is for pre-translation.
    /// </summary>
    /// <value>
    /// <c>true</c> if this corpus is for pre-translation; otherwise, <c>false</c>.
    /// </value>
    public bool PreTranslate { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether this corpus is to be used for Serval as additional training data.
    /// </summary>
    /// <value>
    /// <c>true</c> if this corpus is additional training data; otherwise, <c>false</c>.
    /// </value>
    /// <remarks>If this is set to <c>true</c>, there should be another corpus with this set to <c>false</c>.</remarks>
    public bool AdditionalTrainingData { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether this corpus is to be used for Serval to train on.
    /// </summary>
    /// <value>
    /// <c>true</c> if this corpus is for training; otherwise, <c>false</c> if this corpus is for translation.
    /// </value>
    /// <remarks>If this is set to <c>true</c>, there should be another corpus with this set to <c>false</c>.</remarks>
    public bool AlternateTrainingSource { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether to upload the project as a Paratext zip file.
    /// </summary>
    /// <value>
    /// <c>true</c> if we are uploading a Paratext zip file; otherwise, <c>false</c> if this corpus is for translation.
    /// </value>
    /// <remarks>
    /// This is only for use with Pre-translation - not with SMT.
    /// </remarks>
    public bool UploadParatextZipFile { get; set; }

    /// <summary>
    /// Gets or sets the source files uploaded to Serval.
    /// </summary>
    /// <value>
    /// The source corpus files.
    /// </value>
    public List<ServalCorpusFile> SourceFiles { get; set; } = [];

    /// <summary>
    /// Gets or sets the target files uploaded to Serval.
    /// </summary>
    /// <value>
    /// The target corpus files.
    /// </value>
    public List<ServalCorpusFile> TargetFiles { get; set; } = [];
}
