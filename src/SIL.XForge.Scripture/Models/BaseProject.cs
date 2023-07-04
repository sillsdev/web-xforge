namespace SIL.XForge.Scripture.Models;

/// <summary>
/// Base Project Information
/// </summary>
/// <remarks>This information is retrieved from the ScrText Settings.</remarks>
public class BaseProject
{
    /// <summary>
    /// Gets or sets the Paratext identifier.
    /// </summary>
    /// <value>
    /// The Paratext identifier.
    /// </value>
    public string ParatextId { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the short name.
    /// </summary>
    /// <value>
    /// The short name.
    /// </value>
    public string ShortName { get; set; } = string.Empty;
}
