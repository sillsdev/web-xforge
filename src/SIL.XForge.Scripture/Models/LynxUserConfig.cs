namespace SIL.XForge.Scripture.Models;

/// <summary>
/// User-specific configuration settings for Lynx writing assistance features.
/// </summary>
public class LynxUserConfig
{
    /// <summary>
    /// Gets or sets whether Lynx auto-corrections (on-type edits) are enabled for this user.
    /// </summary>
    public bool? AutoCorrectionsEnabled { get; set; }

    /// <summary>
    /// Gets or sets whether Lynx assessments (insights) are enabled for this user.
    /// </summary>
    public bool? AssessmentsEnabled { get; set; }
}
