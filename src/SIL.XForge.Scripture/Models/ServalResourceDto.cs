namespace SIL.XForge.Scripture.Models;

/// <summary>
/// The DTO used to describe a Serval Resource (such as a translation engine or build) to the frontend.
/// </summary>
/// <remarks>
/// This is the lowest level of representing an entity from Serval.
/// </remarks>
public class ServalResourceDto
{
    public string Id { get; set; }
    public string Href { get; set; }
}
