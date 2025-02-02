namespace SIL.XForge.Models;

internal enum QueuedAction
{
    /// <summary>
    /// The <c>createDoc</c> action.
    /// </summary>
    Create = 0,

    /// <summary>
    /// The <c>deleteDoc</c> action.
    /// </summary>
    Delete = 1,

    /// <summary>
    /// The <c>submitOp</c> action.
    /// </summary>
    Submit = 2,

    /// <summary>
    /// The <c>replaceDoc</c> action.
    /// </summary>
    Replace = 3,
}
