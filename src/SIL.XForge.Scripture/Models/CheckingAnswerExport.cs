namespace SIL.XForge.Scripture.Models;

/// <summary>Determine what community checking answers should be synced to Paratext.</summary>
public static class CheckingAnswerExport
{
    /// <summary>Export all answers.</summary>
    public const string All = "all";

    /// <summary>Export only answers with status set to export.</summary>
    public const string MarkedForExport = "marked_for_export";

    /// <summary>Do not export any answers.</summary>
    public const string None = "none";
}
