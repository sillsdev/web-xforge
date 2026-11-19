using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// The status of a background job that applies a draft to a project.
/// </summary>
/// <remarks>
/// This lets a client that missed the final <see cref="DraftApplyState"/> notification (for example, because its
/// connection was lost) find out how applying the draft ended.
/// </remarks>
public class DraftApplyJobStatus
{
    /// <summary>
    /// Whether the job has finished, whether successfully or not.
    /// </summary>
    public bool Finished { get; set; }

    /// <summary>
    /// The final state of the job. This matches the final notification sent to clients when the job ends.
    /// It is <c>null</c> until the job has finished.
    /// </summary>
    public DraftApplyState? State { get; set; }

    /// <summary>
    /// The chapters that were applied, in the format "GEN 1".
    /// </summary>
    public List<string> Applied { get; set; } = [];

    /// <summary>
    /// The books and chapters that failed to apply, in the format "GEN" and "GEN 1".
    /// </summary>
    public List<string> Failures { get; set; } = [];
}
