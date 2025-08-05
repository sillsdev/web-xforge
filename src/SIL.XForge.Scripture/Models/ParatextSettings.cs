using System.Collections.Generic;
using SIL.Scripture;

namespace SIL.XForge.Scripture.Models;

public class ParatextSettings
{
    /// <summary> The full name of the project from the local repository. </summary>
    public string FullName { get; init; } = string.Empty;

    /// <summary> Whether a specific project is in a right to left language. </summary>
    public bool IsRightToLeft { get; init; }

    /// <summary> Indicates if the text in the project is editable. </summary>
    public bool Editable { get; init; }
    public int DefaultFontSize { get; init; }
    public string DefaultFont { get; init; } = string.Empty;

    /// <summary> The tag icon used by default for note threads created in SF. </summary>
    public IEnumerable<NoteTag> NoteTags { get; init; } = [];

    /// <summary>
    /// The writing system region from the language identifier.
    /// </summary>
    public string? LanguageRegion { get; init; }

    /// <summary>
    /// The writing system script from the language identifier.
    /// </summary>
    public string? LanguageScript { get; init; }

    /// <summary>
    /// The writing system tag from the language identifier.
    /// </summary>
    public string? LanguageTag { get; init; }
    public string ProjectType { get; init; } = string.Empty;
    public string BaseProjectShortName { get; init; } = string.Empty;
    public string? BaseProjectParatextId { get; init; }
    public string? CopyrightBanner { get; init; }
    public string? CopyrightNotice { get; init; }
    public ScrVers? Versification { get; init; }
    public string Visibility { get; init; } = string.Empty;
}
