namespace SIL.XForge.Scripture.Models;

/// <summary>
/// A pre-translation of a verse or segment.
/// </summary>
public class PreTranslation
{
    /// <summary>
    /// Gets or sets the reference identifier.
    /// </summary>
    /// <remarks>
    /// The segment will be in the format verse_1_2 or verse_1_3b.
    /// </remarks>
    public string Reference { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the translated verse or segment.
    /// </summary>
    public string Translation { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the confidence score for the translation
    /// </summary>
    /// <remarks>
    /// This will be from 0.0 to 1.0 for a valid confidence score,
    /// or -1 if no confidence score is present for the translation.
    /// </remarks>
    public double Confidence { get; set; }
}
