using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// The USFM for the books drafted by a build.
/// </summary>
public class DraftUsfmDto
{
    /// <summary>
    /// The Serval build identifier.
    /// </summary>
    public string BuildId { get; init; } = string.Empty;

    /// <summary>
    /// The books drafted by the build, in canonical order.
    /// </summary>
    public IReadOnlyList<DraftUsfmBookDto> Books { get; init; } = [];
}

/// <summary>
/// The USFM for one book drafted by a build.
/// </summary>
public class DraftUsfmBookDto
{
    /// <summary>
    /// The USFM book identifier, e.g. GEN.
    /// </summary>
    public string BookId { get; init; } = string.Empty;

    /// <summary>
    /// The chapters included in the USFM.
    /// </summary>
    public IReadOnlyList<int> Chapters { get; init; } = [];

    /// <summary>
    /// The complete USFM book text, starting with an \id line.
    /// </summary>
    public string Usfm { get; init; } = string.Empty;
}
