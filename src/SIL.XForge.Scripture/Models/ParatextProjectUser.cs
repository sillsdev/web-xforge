namespace SIL.XForge.Scripture.Models;

/// <summary>
/// A user for a project from the Paratext Registry.
/// </summary>
public record ParatextProjectUser
{
    /// <summary>
    /// The Scripture Forge User Identifier.
    /// </summary>
    public string Id { get; set; } = string.Empty;

    /// <summary>
    /// The Paratext User Identifier.
    /// </summary>
    public string ParatextId { get; set; } = string.Empty;

    /// <summary>
    /// The user's role in the project.
    /// </summary>
    public string Role { get; set; } = string.Empty;

    /// <summary>
    /// The users' Paratext username.
    /// </summary>
    public string Username { get; set; } = string.Empty;
}
