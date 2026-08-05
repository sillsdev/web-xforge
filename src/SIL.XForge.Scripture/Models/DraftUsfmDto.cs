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
    public required string BuildId { get; init; }

    /// <summary>
    /// The books drafted by the build, in canonical order.
    /// </summary>
    public required IReadOnlyList<DraftUsfmBookDto> Books { get; init; }
}

/// <summary>
/// The USFM for one book drafted by a build.
/// </summary>
public class DraftUsfmBookDto
{
    /// <summary>
    /// The USFM book identifier, e.g. GEN.
    /// </summary>
    public required string BookId { get; init; }

    /// <summary>
    /// The chapters included in the USFM.
    /// </summary>
    public required IReadOnlyList<int> Chapters { get; init; }

    /// <summary>
    /// The complete USFM book text, starting with an \id line.
    /// </summary>
    public required string Usfm { get; init; }
}
