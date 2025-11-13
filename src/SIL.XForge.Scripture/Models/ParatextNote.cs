using System;
using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// Represents a Paratext note thread containing one or more comments for a scripture reference.
/// </summary>
public class ParatextNote
{
    public string Id { get; set; } = string.Empty;

    public string VerseRef { get; set; } = string.Empty;

    public IReadOnlyList<ParatextNoteComment> Comments { get; set; } = Array.Empty<ParatextNoteComment>();
}

/// <summary>
/// Represents a single comment that belongs to a Paratext note thread.
/// </summary>
public class ParatextNoteComment
{
    public string VerseRef { get; set; } = string.Empty;

    public string Content { get; set; } = string.Empty;

    public ParatextNoteTag? Tag { get; set; }
}

/// <summary>
/// Represents a Paratext comment tag that has been applied to a comment.
/// </summary>
public class ParatextNoteTag
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Icon { get; set; } = string.Empty;
}
