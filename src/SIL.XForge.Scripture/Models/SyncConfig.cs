namespace SIL.XForge.Scripture.Models;

/// <summary>
/// The configuration of the sync to schedule.
/// </summary>
public class SyncConfig
{
    /// <summary>
    /// The job which must completed before the sync starts.
    /// </summary>
    /// <value>
    /// Optional. The job id.
    /// </value>
    public string? ParentJobId { get; init; }

    /// <summary>
    /// The target project to sync.
    /// </summary>
    /// <value>
    /// Required. The project id.
    /// </value>
    public required string ProjectId { get; init; }

    /// <summary>
    /// A value indicating whether we are to sync the target only.
    /// </summary>
    /// <value>
    /// Required. <c>true</c> if we are to sync the target only; otherwise <c>false</c>.
    /// </value>
    public bool TargetOnly { get; init; }

    /// <summary>
    /// The user who is initiating the sync.
    /// </summary>
    /// <value>
    /// Required. The user id.
    /// </value>
    public required string UserId { get; init; }
}
