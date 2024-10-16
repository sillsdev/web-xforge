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
    /// Gets or sets the Hangfire Job Id for the Translation job.
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
    /// Gets or sets the NMT Translation Engine Id for the project.
    /// </summary>
    /// <value>
    /// The NMT Translation Engine Id.
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
    /// Gets or sets the Hangfire Job Id for the Pre-Translation job.
    /// </summary>
    public string? PreTranslationJobId { get; set; }

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
}
