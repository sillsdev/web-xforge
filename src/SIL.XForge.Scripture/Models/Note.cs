namespace SIL.XForge.Scripture.Models;

/// <summary>Represents a project note.</summary>
public class Note : Comment
{
    public string ThreadId { get; set; }

    /// <summary>Type of note, such as "" for a normal note, or "conflict" for a conflict note.</summary>
    public string Type { get; set; }

    /// <summary>
    /// Type of conflict, if a conflict note. For example, "verseText". If it is not a conflict note, this
    /// may read "unknownConflictType".
    /// </summary>
    public string ConflictType { get; set; }
    public string Status { get; set; }
    public int? TagId { get; set; }
    public string Reattached { get; set; }

    /// <summary>
    /// Who this note is assigned to. This may be a <see cref="ParatextUserProfile" /> OpaqueUserId,
    /// or a category such as team or unassigned.
    /// </summary>
    public string Assignment { get; set; }

    /// <summary>
    /// Content of note. Contains XML. Corresponds to `Contents` element, which is not always present in the
    /// Notes XML file.
    /// </summary>
    public string? Content { get; set; }

    /// <summary>
    /// Change difference accepted from a conflict, if any. Contains encoded XML. Not always present, in
    /// Notes XML file.
    /// </summary>
    public string AcceptedChangeXml { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the note is editable in Scripture Forge.
    /// </summary>
    /// <value>
    /// <list type="table">
    /// <item>
    ///     <term>
    ///         <c>true</c>
    ///     </term>
    ///     <description>
    ///         When the note has been created or edited in Scripture Forge.
    ///     </description>
    /// </item>
    /// <item>
    ///     <term>
    ///         <c>false</c>
    ///     </term>
    ///     <description>
    ///         When the note has been created or edited in Paratext.
    ///     </description>
    /// </item>
    /// <item>
    ///     <term>
    ///         <c>null</c>
    ///     </term>
    ///     <description>
    ///         When the note's state is unknown (assume <c>false</c>).
    ///     </description>
    /// </item>
    /// </list>
    /// </value>
    public bool? Editable { get; set; }

    /// <summary>
    /// Gets or sets the note's version number.
    /// </summary>
    /// <remarks>This corresponds the comment version number in the Comment XML file.</remarks>
    public int? VersionNumber { get; set; }

    /// <summary>The default value for ConflictType in Paratext is "unknownConflictType", which is present
    /// in Note XML files when the note is not a conflict note. However, this is not one of the values of
    /// the NoteConflictType enum.</summary>
    public const string NoConflictType = "unknownConflictType";
}
