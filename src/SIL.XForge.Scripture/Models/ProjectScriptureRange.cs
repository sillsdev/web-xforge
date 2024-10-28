namespace SIL.XForge.Scripture.Models;

/// <summary>
/// A scripture range for a specific project.
/// This is used by <see cref="BuildConfig"/>.
/// </summary>
public record ProjectScriptureRange
{
    /// <summary>
    /// The project identifier.
    /// </summary>
    public string ProjectId { get; set; } = string.Empty;

    /// <summary>
    /// The scripture range.
    /// </summary>
    /// <value>The book ids and chapter numbers separated by semicolons.</value>
    /// <remarks>
    /// See https://github.com/sillsdev/serval/wiki/Filtering-Paratext-Project-Data-with-a-Scripture-Range for syntax.
    /// </remarks>
    public string ScriptureRange { get; set; } = string.Empty;
}
