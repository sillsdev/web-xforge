using System;
using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// A request to sign up for drafting support submitted through the in-app form.
/// Contains the submission data along with metadata for tracking progress.
/// </summary>
public class DraftingSignupRequest : IIdentifiable
{
    public string Id { get; set; } = string.Empty;

    /// <summary>
    /// The submission data containing all the form information and metadata.
    /// </summary>
    public DraftingSignupSubmission Submission { get; set; } = new DraftingSignupSubmission();

    /// <summary>
    /// Admin comments on this drafting signup request.
    /// </summary>
    public List<DraftRequestComment> Comments { get; set; } = [];

    /// <summary>
    /// The ID of the user assigned to handle this request. Empty string means unassigned.
    /// </summary>
    public string AssigneeId { get; set; } = string.Empty;

    /// <summary>
    /// The resolution of this request: null (default), "approved", "declined", or "outsourced".
    /// </summary>
    public string? Resolution { get; set; }

    /// <summary>
    /// Gets the status of this request based on assignee and resolution.
    /// Returns "new" if unassigned and unresolved, "in_progress" if assigned but unresolved,
    /// or "completed" if resolved.
    /// </summary>
    public string Status
    {
        get
        {
            if (!string.IsNullOrEmpty(Resolution))
            {
                return "completed";
            }

            if (!string.IsNullOrEmpty(AssigneeId))
            {
                return "in_progress";
            }

            return "new";
        }
    }
}

/// <summary>
/// The submission data for a drafting signup request.
/// Contains the project ID, user ID, timestamp, and all form data.
/// </summary>
public class DraftingSignupSubmission
{
    /// <summary>
    /// The ID of the project this signup request is for.
    /// </summary>
    public string ProjectId { get; set; } = string.Empty;

    /// <summary>
    /// The ID of the user who submitted this signup request.
    /// </summary>
    public string UserId { get; set; } = string.Empty;

    /// <summary>
    /// The timestamp when this signup request was submitted.
    /// </summary>
    public DateTime Timestamp { get; set; }

    /// <summary>
    /// The form data submitted by the user.
    /// </summary>
    public DraftingSignupFormData FormData { get; set; } = new DraftingSignupFormData();
}

/// <summary>
/// Parameters for submitting a drafting signup request.
/// </summary>
public class SubmitSignupRequestParameters
{
    public string ProjectId { get; set; } = string.Empty;
    public DraftingSignupFormData FormData { get; set; } = new DraftingSignupFormData();
}

/// <summary>
/// The form data from the drafting signup form.
/// </summary>
public class DraftingSignupFormData
{
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Organization { get; set; }
    public int[]? CompletedBooks { get; set; }
    public int[]? NextBooksToDraft { get; set; }
    public string? PrimarySourceProject { get; set; }
    public string? SecondarySourceProject { get; set; }
    public string? AdditionalSourceProject { get; set; }
    public string? DraftingSourceProject { get; set; }
    public string? BackTranslationStage { get; set; }
    public string? BackTranslationProject { get; set; }
    public string? AdditionalComments { get; set; }
    public string? PartnerOrganization { get; set; }
}

/// <summary>
/// A comment on a drafting signup request, created by Serval admins.
/// </summary>
public class DraftRequestComment
{
    /// <summary>
    /// The unique ID of this comment.
    /// </summary>
    public string Id { get; set; } = string.Empty;

    /// <summary>
    /// The ID of the user who created this comment.
    /// </summary>
    public string UserId { get; set; } = string.Empty;

    /// <summary>
    /// The text content of the comment.
    /// </summary>
    public string Text { get; set; } = string.Empty;

    /// <summary>
    /// The timestamp when this comment was created.
    /// </summary>
    public DateTime DateCreated { get; set; }
}
