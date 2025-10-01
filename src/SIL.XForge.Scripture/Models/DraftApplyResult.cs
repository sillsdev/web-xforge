using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// The result of applying a draft.
/// </summary>
public class DraftApplyResult
{
    /// <summary>
    /// Whether changes were saved to the database.
    /// </summary>
    public bool ChangesSaved { get; set; }

    /// <summary>
    /// A list of any books and chapters that failed to apply in the format "GEN" and "GEN 1".
    /// </summary>
    public HashSet<string> Failures = [];

    /// <summary>
    /// A log containing any warnings or errors that occurred while applying the draft.
    /// </summary>
    public string Log { get; set; } = string.Empty;
}
