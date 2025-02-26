using SIL.XForge.Services;

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
    /// A value indicating whether we are to train the SMT engine.
    /// </summary>
    /// <value>
    /// Required. <c>true</c> if we are to train the SMT engine; otherwise <c>false</c>.
    /// </value>
    /// <remarks>This value is not used if <see cref="TargetOnly"/> is <c>true</c>.</remarks>
    public bool TrainEngine { get; init; }

    /// <summary>
    /// The user who is initiating the sync.
    /// </summary>
    /// <value>
    /// Required. The user accessor.
    /// </value>
    public required IUserAccessor UserAccessor { get; init; }
}
