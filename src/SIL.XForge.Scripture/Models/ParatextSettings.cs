using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

public class ParatextSettings
{
    /// <summary> The full name of the project from the local repository. </summary>
    public string FullName { get; set; }

    /// <summary> Whether a specific project is in a right to left language. </summary>
    public bool IsRightToLeft { get; set; }

    /// <summary> Indicates if the text in the project is editable. </summary>
    public bool Editable { get; set; }
    public int DefaultFontSize { get; set; }
    public string DefaultFont { get; set; }

    /// <summary> The tag icon used by default for note threads created in SF. </summary>
    public IEnumerable<NoteTag> NoteTags { get; set; }
    public string? LanguageTag { get; set; }
    public string ProjectType { get; set; } = string.Empty;
    public string BaseProjectShortName { get; set; } = string.Empty;
    public string? BaseProjectParatextId { get; set; }
    public string? CopyrightBanner { get; set; }
    public string? CopyrightNotice { get; set; }
}
