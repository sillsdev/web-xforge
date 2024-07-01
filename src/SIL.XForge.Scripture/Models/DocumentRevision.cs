using System;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// A revision of a document in ShareDB and/or Paratext.
/// </summary>
public class DocumentRevision
{
    /// <summary>
    /// A source value representing revisions from Paratext.
    /// </summary>
    public const string Paratext = "paratext";

    /// <summary>
    /// Gets the date and time of the revision in UTC.
    /// </summary>
    [Obsolete("For backwards compatibility with older frontend clients. Deprecated July 2024.")]
    public DateTime Key => Timestamp;

    /// <summary>
    /// Gets the source of the revision, if known.
    /// </summary>
    /// <value>
    /// The source may be: 'editor', 'history', 'draft', 'paratext', or null.
    /// </value>
    public string? Source { get; init; }

    /// <summary>
    /// Gets the timestamp at which the revision was made.
    /// </summary>
    /// <value>The timestamp in UTC.</value>
    public DateTime Timestamp { get; init; }

    /// <summary>
    /// Gets the identifier of the user who made the revision.
    /// </summary>
    /// <value>The user identifier.</value>
    public string? UserId { get; init; }

    /// <summary>
    /// Gets a brief summary of the revision.
    /// </summary>
    [Obsolete("For backwards compatibility with older frontend clients. Deprecated July 2024.")]
    public string Value => Source == Paratext ? "Updated in Paratext" : "Updated in Scripture Forge";
}
