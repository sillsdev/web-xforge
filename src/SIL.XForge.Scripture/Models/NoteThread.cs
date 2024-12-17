using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models;

public class NoteThread : ProjectData
{
    public static string GetDocId(string sfProjectId, string dataId) => $"{sfProjectId}:{dataId}";

    public string DataId { get; set; }
    public string ThreadId { get; set; }
    public VerseRefData VerseRef { get; set; }
    public List<Note> Notes { get; set; } = [];
    public string OriginalSelectedText { get; set; }
    public string OriginalContextBefore { get; set; }
    public string OriginalContextAfter { get; set; }
    public TextAnchor Position { get; set; }
    public string ParatextUser { get; set; }
    public bool? PublishedToSF { get; set; }
    public string Status { get; set; }

    /// <summary>
    /// Who this note thread is assigned to. This may be a <see cref="ParatextUserProfile" /> OpaqueUserId,
    /// or a category such as team or unassigned.
    /// </summary>
    public string Assignment { get; set; }

    /// <summary>
    /// The Biblical Term this note is for. Null if not for a Biblical Term.
    /// </summary>
    public string? BiblicalTermId { get; set; }

    /// <summary>
    /// Extra heading information that is defined for Biblical Term notes. Null if not for a Biblical Term.
    /// </summary>
    public BiblicalTermNoteHeadingInfo? ExtraHeadingInfo { get; set; }
}
