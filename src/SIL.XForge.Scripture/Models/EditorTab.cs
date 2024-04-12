namespace SIL.XForge.Scripture.Models;

/// <summary>
/// Minimal data to persist and reconstruct an editor tab.
/// </summary>
public class EditorTab
{
    /// <summary>
    /// Corresponds to EditorTabType.
    /// </summary>
    public string TabType { get; set; }

    /// <summary>
    /// Which tab group this tab belongs to.
    /// </summary>
    public string GroupId { get; set; }

    /// <summary>
    /// Whether the tab is selected within its group.
    /// </summary>
    public bool? IsSelected { get; set; }

    /// <summary>
    /// The SF project id if tab is a project/resource tab.
    /// </summary>
    public string? ProjectId { get; set; }
}
