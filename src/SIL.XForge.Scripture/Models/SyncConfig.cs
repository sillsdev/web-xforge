namespace SIL.XForge.Scripture.Models;

/// <summary>
/// The configuration of the sync to schedule.
/// </summary>
/// <remarks>
/// TODO: Make CurUserId and ProjectId required in .NET 8.0.
/// </remarks>
public record SyncConfig
{
    /// <summary>
    /// The target project to sync.
    /// </summary>
    /// <value>
    /// Required. The project id.
    /// </value>
    public string ProjectId { get; init; } = string.Empty;

    /// <summary>
    /// A value indicating whether or not we are to sync the target only.
    /// </summary>
    /// <value>
    /// Required. <c>true</c> if we are to sync the target only; otherwise <c>false</c>.
    /// </value>
    public bool TargetOnly { get; init; }

    /// <summary>
    /// A value indicating whether or not we are to train the SMT engine.
    /// </summary>
    /// <value>
    /// Required. <c>true</c> if we are to train the SMT engine; otherwise <c>false</c>.
    /// </value>
    public bool TrainEngine { get; init; }

    /// <summary>
    /// The user who is initiating the sync.
    /// </summary>
    /// <value>
    /// Required. The user id.
    /// </value>
    public string UserId { get; init; } = string.Empty;
}
