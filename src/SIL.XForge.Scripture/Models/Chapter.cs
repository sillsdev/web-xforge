using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

public class Chapter
{
    public int Number { get; set; }
    public int LastVerse { get; set; }

    /// <summary>
    /// Whether the chapter's USX conforms to the usx-sf SF USX schema, which is a subset of the USX schema. And if
    /// nothing was flagged as invalid by tighter constraints of the DeltaUsxMapper. If a chapter is marked as invalid,
    /// it will not be editable in SF.
    /// </summary>
    public bool IsValid { get; set; }
    public Dictionary<string, string> Permissions { get; set; } = [];
    public bool? HasAudio { get; set; }
    public bool? HasDraft { get; set; }
    public bool? DraftApplied { get; set; }
}
