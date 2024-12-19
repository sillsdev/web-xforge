namespace SIL.XForge.EventMetrics;

/// <summary>
/// The event scope.
/// </summary>
/// <remarks>
/// These correspond to various sub systems of Scripture Forge.
/// </remarks>
public enum EventScope
{
    /// <summary>
    /// No event scope was specified.
    /// </summary>
    None,

    /// <summary>
    /// Project Settings.
    /// </summary>
    Settings,

    /// <summary>
    /// Project Synchronization.
    /// </summary>
    Sync,

    /// <summary>
    /// Draft Generation and Pre-Translation Drafting.
    /// </summary>
    Drafting,

    /// <summary>
    /// Community Checking.
    /// </summary>
    Checking,
}
