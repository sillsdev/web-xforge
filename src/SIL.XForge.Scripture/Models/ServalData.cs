using System;
using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// Serval Configuration Data.
/// </summary>
public class ServalData
{
    /// <summary>
    /// Gets or sets the SMT Translation Engine identifier for the project.
    /// </summary>
    /// <value>
    /// The SMT Translation Engine identifier.
    /// </value>
    /// <remarks>
    /// The user should not interact with the translation engine directly by ID.
    /// </remarks>
    public string? TranslationEngineId { get; set; }

    /// <summary>
    /// Gets or sets the Translation error message.
    /// </summary>
    /// <value>
    /// The SMT Translation error message.
    /// </value>
    /// <remarks>
    /// <para>If this is null, no error has been yet reported.</para>
    /// <para>This property should be set to null if a build starts.</para>
    /// </remarks>
    public string? TranslationErrorMessage { get; set; }

    /// <summary>
    /// Gets or sets the Hangfire Job identifier for the Translation job.
    /// </summary>
    public string? TranslationJobId { get; set; }

    /// <summary>
    /// Gets or sets the date and time that the translation build was queued.
    /// </summary>
    /// <value>
    /// The date and time in UTC that the translation build was queued;
    /// otherwise, null if the build has started on Serval or is not running.
    /// </value>
    /// <remarks>
    /// This is used to keep track of whether a build and its corpus is currently uploading to Serval.
    /// If this is longer than 6 hours ago (UTC), there will have been a crash, so an error should be reported.
    /// </remarks>
    public DateTime? TranslationQueuedAt { get; set; }

    /// <summary>
    /// Gets or sets the NMT Translation Engine identifier for the project.
    /// </summary>
    /// <value>
    /// The NMT Translation Engine identifier.
    /// </value>
    public string? PreTranslationEngineId { get; set; }

    /// <summary>
    /// Gets or sets the Pre-Translation error message.
    /// </summary>
    /// <value>
    /// The NMT Pre-Translation error message.
    /// </value>
    /// <remarks>
    /// <para>If this is null, no error has been yet reported.</para>
    /// <para>This property should be set to null if a build starts.</para>
    /// </remarks>
    public string? PreTranslationErrorMessage { get; set; }

    /// <summary>
    /// Gets or sets the Hangfire Job identifier for the Pre-Translation job.
    /// </summary>
    public string? PreTranslationJobId { get; set; }

    /// <summary>
    /// Gets or sets the user identifier for last user to start a Pre-Translation build.
    /// </summary>
    public string? PreTranslationLastUserId { get; set; }

    /// <summary>
    /// Gets or sets the Identifier of the Parallel Corpus to be used in the PreTranslate section of the
    /// <see cref="Serval.Client.TranslationBuildConfig"/> for pre-translation (NMT) builds.
    /// </summary>
    public string? ParallelCorpusIdForPreTranslate { get; set; }

    /// <summary>
    /// Gets or sets the Identifier of the Parallel Corpus to be used for translation (SMT) builds.
    /// </summary>
    public string? ParallelCorpusIdForSmt { get; set; }

    /// <summary>
    /// Gets or sets the Identifier of the Parallel Corpus to be used in the TrainOn section of the
    /// <see cref="Serval.Client.TranslationBuildConfig"/> for pre-translation (NMT) builds.
    /// </summary>
    public string? ParallelCorpusIdForTrainOn { get; set; }

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
    /// Gets or sets a value indicating whether the pre-translations have been retrieved.
    /// </summary>
    /// <value>
    /// <c>true</c> if the pre-translations have been retrieved;
    /// <c>false</c> if they are being retrieved;
    /// <c>null</c> if they have not been retrieved yet.
    /// </value>
    /// <remarks>
    /// This is used by <see cref="Services.MachineApiService.RetrievePreTranslationStatusAsync"/>
    /// to determine the local state of the pre-translations.
    /// </remarks>
    public bool? PreTranslationsRetrieved { get; set; }

    /// <summary>
    /// Gets or sets the corpora uploaded to Serval.
    /// </summary>
    /// <value>
    /// The machine corpora.
    /// </value>
    /// <remarks>
    /// The dictionary key is the corpus ID.
    /// </remarks>
    public Dictionary<string, ServalCorpus>? Corpora { get; set; }

    /// <summary>
    /// Gets or sets the additional training data configuration for pre-translation (NMT) builds.
    /// </summary>
    public ServalAdditionalTrainingData? AdditionalTrainingData { get; set; }

    /// <summary>
    /// Gets or sets the corpus and data files configuration.
    /// </summary>
    /// <remarks>
    /// These are shared by translation (SMT) and pre-translation (NMT) translation engines.
    /// </remarks>
    public List<ServalCorpusFile> CorpusFiles { get; set; } = [];
}
