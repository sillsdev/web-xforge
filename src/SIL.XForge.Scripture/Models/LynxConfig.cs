namespace SIL.XForge.Scripture.Models;

/// <summary>
/// Configuration settings for Lynx writing assistance features.
/// </summary>
public class LynxConfig
{
    /// <summary>
    /// Gets or sets whether Lynx auto-corrections (on-type edits) are enabled.
    /// </summary>
    public bool AutoCorrectionsEnabled { get; set; }

    /// <summary>
    /// Gets or sets whether Lynx assessments (insights) are enabled.
    /// </summary>
    public bool AssessmentsEnabled { get; set; }

    /// <summary>
    /// Gets or sets whether Lynx punctuation checking is enabled (subset of assessments).
    /// </summary>
    public bool PunctuationCheckerEnabled { get; set; }

    /// <summary>
    /// Gets or sets whether Lynx allowed character checking is enabled (subset of assessments).
    /// </summary>
    public bool AllowedCharacterCheckerEnabled { get; set; }
}
