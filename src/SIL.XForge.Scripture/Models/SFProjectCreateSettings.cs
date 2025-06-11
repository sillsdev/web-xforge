namespace SIL.XForge.Scripture.Models;

/// <summary>
/// The configuration settings for creating a new project in Scripture Forge.
/// </summary>
public class SFProjectCreateSettings
{
    /// <summary>
    /// Gets or sets the Paratext project identifier.
    /// </summary>
    /// <value>
    /// The Paratext project identifier.
    /// </value>
    public string ParatextId { get; init; }

    /// <summary>
    /// Gets or sets the source Paratext project identifier.
    /// </summary>
    /// <value>
    /// The source Paratext project identifier.
    /// </value>
    /// <remarks>
    /// This will specify the project to be used for SMT suggestions and the left hand panel in the editor.
    /// </remarks>
    public string? SourceParatextId { get; init; }

    /// <summary>
    /// Gets or sets whether community checking is enabled for the project.
    /// </summary>
    /// <value>
    /// <c>true</c> if community checking is enabled; otherwise, <c>false</c>.
    /// </value>
    public bool CheckingEnabled { get; init; }

    /// <summary>
    /// Gets or sets the answer export method.
    /// </summary>
    /// <value>
    /// May be one of the following: "marked_for_export", "all", or "none".
    /// </value>
    /// <remarks>
    /// Defaults to "marked_for_export".
    /// </remarks>
    public string AnswerExportMethod { get; init; } = CheckingAnswerExport.MarkedForExport;
}
