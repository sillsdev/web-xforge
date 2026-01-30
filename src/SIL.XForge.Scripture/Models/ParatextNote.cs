using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// Represents a Paratext note thread containing one or more comments for a scripture reference.
/// </summary>
public class ParatextNote
{
    public required string Id { get; init; }

    public required string VerseRef { get; init; }

    public required IReadOnlyList<ParatextNoteComment> Comments { get; init; }
}

/// <summary>
/// Represents a single comment that belongs to a Paratext note thread.
/// </summary>
public class ParatextNoteComment
{
    public required string VerseRef { get; init; }

    public required string Content { get; init; }

    public ParatextNoteTag? Tag { get; init; }
}

/// <summary>
/// Represents a Paratext comment tag that has been applied to a comment.
/// </summary>
public class ParatextNoteTag
{
    public int Id { get; init; }

    public required string Name { get; init; }

    public required string Icon { get; init; }
}
