using System;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// Feedback submitted by a user about a specific project.
/// </summary>
public class UserFeedback : IIdentifiable
{
    /// <summary>
    /// Gets the document identifier for the user feedback.
    /// </summary>
    /// <param name="sfProjectId">The Scripture Forge project identifier.</param>
    /// <param name="userId">The user identifier.</param>
    /// <returns>An id in the format <c>projectId:userId</c>.</returns>
    public static string GetDocId(string sfProjectId, string userId) => $"{sfProjectId}:{userId}";

    /// <summary>
    /// Gets or sets the identifier.
    /// </summary>
    /// <remarks>This is in the format projectId:userId.</remarks>
    public required string Id { get; set; }

    /// <summary>
    /// Gets the project reference from the document identifier.
    /// </summary>
    public string ProjectRef => Id.Split(':')[0];

    /// <summary>
    /// Gets or sets string containing the feedback provided by the user.
    /// </summary>
    public string Feedback { get; init; } = string.Empty;

    /// <summary>
    /// Gets or sets the date when the feedback was submitted.
    /// </summary>
    public DateTime DateSubmitted { get; init; }
}
