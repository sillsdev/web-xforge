using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using Serval.Client;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// A report of a Serval build, combining Serval-native data with SF project context and event metrics information.
/// Returned by the builds-since endpoint for the Serval admin page.
/// </summary>
public class ServalBuildReportDto
{
    /// <summary>
    /// The Serval build data. Null for records with only event metrics where SF recorded draft generation events but
    /// Serval did not report a corresponding build.
    /// </summary>
    public ServalBuildDto? Build { get; init; }

    /// <summary>
    /// SF project context for the build. Null if the project could not be identified.
    /// </summary>
    public BuildReportProject? Project { get; init; }

    /// <summary>
    /// Timeline of events from both Serval and SF event metrics.
    /// </summary>
    public BuildReportTimeline Timeline { get; init; } = new();

    /// <summary>
    /// Build configuration: Scripture ranges and training data files.
    /// </summary>
    public BuildReportConfig Config { get; init; } = new();

    /// <summary>
    /// Problems or warnings identified for this build.
    /// </summary>
    public List<string> Problems { get; init; } = [];

    /// <summary>
    /// The SF draft generation request identifier, if one was found.
    /// </summary>
    public string? DraftGenerationRequestId { get; init; }

    /// <summary>
    /// The SF user who requested this build, if known.
    /// </summary>
    public string? RequesterSFUserId { get; init; }

    /// <summary>
    /// Status of the build.
    /// </summary>
    [JsonConverter(typeof(StringEnumConverter))]
    public DraftGenerationBuildStatus Status { get; init; }
}

/// <summary>
/// SF project context for a build report entry.
/// </summary>
public class BuildReportProject
{
    public string SFProjectId { get; init; } = string.Empty;
    public string? ShortName { get; init; }
    public string? Name { get; init; }
}

/// <summary>
/// Timeline of events for a build, combining Serval timestamps and SF event metric timestamps.
/// </summary>
public class BuildReportTimeline
{
    // Serval timestamps
    public DateTimeOffset? ServalCreated { get; init; }
    public DateTimeOffset? ServalStarted { get; init; }
    public DateTimeOffset? ServalCompleted { get; init; }
    public DateTimeOffset? ServalFinished { get; init; }

    // SF event metric timestamps

    /// <summary>
    /// When SF began working on the user's draft generation request.  Associated with the StartPreTranslationBuildAsync event.
    /// </summary>
    public DateTimeOffset? SFUserRequested { get; init; }

    /// <summary>
    /// When SF started the last steps that lead to sending a build request to Serval. Associated with the
    /// BuildProjectAsync event.
    /// </summary>
    public DateTimeOffset? SFBuildProjectSubmitted { get; init; }

    /// <summary>
    /// When SF received a user cancellation request.
    /// </summary>
    public DateTimeOffset? SFUserCancelled { get; init; }

    /// <summary>
    /// When SF received a Serval completion notice.
    /// </summary>
    public DateTimeOffset? SFAcknowledgedCompletion { get; init; }

    /// <summary>
    /// When the build was requested, with SF event time preferred over Serval creation time.
    /// This is a computed convenience property.
    /// </summary>
    public DateTimeOffset? RequestTime { get; init; }

    /// <summary>
    /// Information on different activities during the build.
    /// </summary>
    public IList<Phase>? Phases { get; init; }
}

/// <summary>
/// Build configuration: which Scripture ranges were trained on and translated, and what training data files were used.
/// </summary>
public class BuildReportConfig
{
    public HashSet<BuildReportProjectScriptureRange> TrainingScriptureRanges { get; init; } = [];
    public HashSet<BuildReportProjectScriptureRange> TranslationScriptureRanges { get; init; } = [];
    public HashSet<string> TrainingDataFileIds { get; init; } = [];
}

/// <summary>
/// A scripture range entry enriched with the referenced project's display information.
/// Similar to <see cref="ProjectScriptureRange"/> but includes the project short name and name for display purposes.
/// </summary>
public class BuildReportProjectScriptureRange
{
    public string SFProjectId { get; init; } = string.Empty;
    public string ScriptureRange { get; init; } = string.Empty;
    public string? ShortName { get; init; }
    public string? Name { get; init; }
}
