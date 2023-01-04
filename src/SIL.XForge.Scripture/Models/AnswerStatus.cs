namespace SIL.XForge.Scripture.Models;

/// <summary>The status of an community checking answer.</summary>
public static class AnswerStatus
{
    /// <summary>No status.</summary>
    public const string None = "";

    /// <summary>Answer has been resolved.</summary>
    public const string Resolved = "resolve";

    /// <summary>Answer can be exported during a sync if configured on the project.</summary>
    public const string Exportable = "export";
}
