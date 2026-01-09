using System;
using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// A request to sign up for drafting support submitted through the in-app form.
/// Contains the submission data along with metadata for tracking progress.
/// </summary>
public class OnboardingRequest : IIdentifiable
{
    public string Id { get; set; } = string.Empty;

    /// <summary>
    /// The submission data containing all the form information and metadata.
    /// </summary>
    public OnboardingSubmission Submission { get; set; } = new OnboardingSubmission();

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
public class OnboardingSubmission
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
    public OnboardingRequestFormData FormData { get; set; } = new OnboardingRequestFormData();
}

/// <summary>
/// Parameters for submitting a drafting signup request.
/// </summary>
public class OnboardingRequestParameters
{
    public string ProjectId { get; set; } = string.Empty;
    public OnboardingRequestFormData FormData { get; set; } = new OnboardingRequestFormData();
}

/// <summary>
/// The form data from the drafting signup form.
/// </summary>
public class OnboardingRequestFormData
{
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Organization { get; set; } = string.Empty;
    public string PartnerOrganization { get; set; } = string.Empty;
    public string TranslationLanguageName { get; set; } = string.Empty;
    public string TranslationLanguageIsoCode { get; set; } = string.Empty;
    public int[] CompletedBooks { get; set; } = [];
    public int[] NextBooksToDraft { get; set; } = [];
    public string? sourceProjectA { get; set; }
    public string? sourceProjectB { get; set; }
    public string? sourceProjectC { get; set; }
    public string? DraftingSourceProject { get; set; }
    public string BackTranslationStage { get; set; } = string.Empty;
    public string? BackTranslationProject { get; set; }
    public string BackTranslationLanguageName { get; set; } = string.Empty;
    public string BackTranslationLanguageIsoCode { get; set; } = string.Empty;
    public string AdditionalComments { get; set; } = string.Empty;
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
