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
}
