/// <summary>
/// The sync phase.
/// </summary>
/// <remarks>
/// The first phase must be 0, and each succeeding phase in numeric sequence, as the integer value of the
/// SyncPhase enum is used to calculate the progress value in <see cref="SIL.XForge.Scripture.Services.ParatextSyncRunner.NotifySyncProgress"/>.
/// </remarks>
public enum SyncPhase
{
    Phase1 = 0, // Initial methods
    Phase2 = 1, // Update Paratext books and notes
    Phase3 = 2, // Update Paratext biblical term renderings
    Phase4 = 3, // Paratext Sync
    Phase5 = 4, // Deleting texts and granting resource access
    Phase6 = 5, // Getting the resource texts
    Phase7 = 6, // Updating texts from Paratext books
    Phase8 = 7, // Update biblical terms from Paratext
    Phase9 = 8, // Final methods
}
