using System;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models;

public class UserFeedbackParams
{
    public string Type { get; init; } = FeedbackType.HowSfImpactedProject;
    public string Source { get; init; } = FeedbackSourcePage.None;
    public string Permission { get; init; } = FeedbackPermission.Private;
    public string Feedback { get; init; } = string.Empty;
}

/// <summary>
/// The question the user was answering when giving feedback.
/// </summary>
public static class FeedbackType
{
    public const string HowSfImpactedProject = "how_sf_impacted_project";
}

public static class FeedbackSourcePage
{
    public const string None = "none";
    public const string GenerateDraftPage = "generate_draft_page";
}

public static class FeedbackPermission
{
    public const string PublishPublic = "publish_public";
    public const string PublishAnonymous = "publish_anonymous";
    public const string Private = "private";
}

/// <summary>
/// Feedback submitted by a user, optionally about one of their projects.
/// </summary>
public class UserFeedback : IIdentifiable
{
    /// <summary>
    /// The identifier for the feedback.
    /// </summary>
    public required string Id { get; set; }

    /// <summary>
    /// The id of the project the feedback is about, or empty if the user did not select a project.
    /// </summary>
    public string ProjectRef { get; init; } = string.Empty;

    public string UserRef { get; init; } = string.Empty;

    /// <summary>
    /// The type of feedback provided by a user.
    /// </summary>
    public string Type { get; init; } = string.Empty;

    /// <summary>
    /// The page the user was on when asked for feedback. See <see cref="FeedbackSourcePage"/>.
    /// </summary>
    public string Source { get; init; } = string.Empty;

    public string FeedbackPermission { get; init; } = string.Empty;

    /// <summary>
    /// A string containing the feedback provided by the user.
    /// </summary>
    public string Feedback { get; init; } = string.Empty;

    /// <summary>
    /// The date when the feedback was submitted.
    /// </summary>
    public DateTime DateSubmitted { get; init; }
}
