using System;

namespace SIL.XForge.Models;

/// <summary>
/// Represents an invitation to a project. The share key is shared with a user via email, or shared via other means.
/// The user can then use the share key to join the project.
/// - When a user is invited via email a share key is created and a link is sent to the user.
/// - If an invitation is sent again to the same email with a different role, the share key is updated with the new role
///   and the link is resent. Both the original and new email invitations will both work, since there is only one share
///   key.
/// - When a recipient-only invitation is shared by other means (e.g. copying the link), a new share key is created as
///   soon as the user opens the dialog (i.e. *before* the user has actually shared the link) so that when the share
///   button is clicked the link can be instantly copied. What this means is that at any given time, there may be multiple
///   single-use share keys for a given project that have not yet been used (potentially as many as the number of roles
///   that are available to share). When a link is copied the expiration time is set, and the share key is marked as
///   "reserved".
/// See documentation for individual properties for more details.
/// </summary>
public class ShareKey
{
    /// <summary>
    /// Gets or set the role of the user that created this share key.
    /// </summary>
    public string CreatedByRole { get; set; } = string.Empty;

    /// <summary>
    /// Optional.
    /// Specifies the email address the invitation link was sent to. This is only used if the invitation is sent via
    /// email, and allows us to list users that have been invited with their respective email addresses on the users
    /// page. When the user signs up we do not check that the email address matches (there might not even be an email
    /// address on the account to check against).
    /// </summary>
    public string? Email { get; set; }

    /// <summary>
    /// A cryptographically random key that grants access to a project. Depending on the other settings this key may be
    /// valid for multiple users, or only the first user to use it.
    /// <summary>
    public string Key { get; set; } = string.Empty;

    /// <summary>
    /// Optional.
    /// The date and time the share link expires. If null, the share link never expires. This is set when either:
    /// - the share key is sent to the user by email
    /// - the share key is copied/shared by a user and gets marked as "reserved"
    /// </summary>
    public DateTime? ExpirationTime { get; set; }

    /// <summary>
    /// Required.
    /// Must be one of "recipient" or "anyone", indicating whether the link can be used only one time, or can be used
    /// repeatedly (so it could be shared with multiple people). Invitation sent by email are always "recipient".
    /// </summary>
    public string ShareLinkType { get; set; } = string.Empty;

    /// <summary>
    /// The role the user will have when they use the share key to join the project.
    /// </summary>
    public string ProjectRole { get; set; } = string.Empty;

    /// <summary>
    /// The ID of the user that used the key to join a project. This is only set if the ShareLinkType is "recipient".
    /// The presence of the RecipientUserId indicates that the share key has been used and is no longer valid for
    /// granting access to a project. However, if the user with this ID attempts to use the share key again, we can
    /// redirect the user to the project, since the user has already been added.
    /// </summary>
    public string? RecipientUserId { get; set; }

    /// <summary>
    /// Determines if a one time, recipient only, share link has been shared which requires the key to be reserved
    /// only for that link. Any new one time, recipient only, share links required will generate a new share key
    /// </summary>
    public bool? Reserved { get; set; }

    /// <summary>
    /// Used to keep track of how many Auth0 user accounts have been generated using this share key. This allows for a
    /// basic rate limiting check to ensure any abuse is restricted. An optional setting on the project is available to
    /// increase the rate limiting if required.
    /// </summary>
    public int? UsersGenerated { get; set; } = 0;
}
