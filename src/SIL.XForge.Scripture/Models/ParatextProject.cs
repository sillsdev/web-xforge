using System.Text;

namespace SIL.XForge.Scripture.Models;

/// <summary>Description of a project on the Paratext server.</summary>
public class ParatextProject
{
    /// <summary>
    /// The identifier of the PT project on Paratext servers.
    /// </summary>
    public string ParatextId { get; init; } = string.Empty;

    /// <summary>
    /// The full name of the project.
    /// </summary>
    public string Name { get; init; } = string.Empty;

    /// <summary>
    /// The short name of the project.
    /// </summary>
    public string ShortName { get; init; } = string.Empty;

    /// <summary>
    /// The writing system region from the language identifier.
    /// </summary>
    public string? LanguageRegion { get; init; }

    /// <summary>
    /// The writing system script from the language identifier.
    /// </summary>
    public string? LanguageScript { get; init; }

    /// <summary>
    /// The writing system tag from the language identifier.
    /// </summary>
    public string LanguageTag { get; init; } = string.Empty;

    /// <summary>
    /// If <c>true</c>, the project's script is right to left.
    /// </summary>
    public bool? IsRightToLeft { get; init; }

    /// <summary>
    /// The identifier of corresponding SF project.
    /// </summary>
    public string? ProjectId { get; init; }

    /// <summary>
    /// If the requesting user has access to the PT project, but not yet to a corresponding SF project, and has
    /// permission to connect an SF project to the PT project. The SF project may or may not yet already exist.
    /// </summary>
    public bool IsConnectable { get; init; }

    /// <summary>
    /// If the requesting user has access to both the PT project and the corresponding SF project.
    /// </summary>
    public bool IsConnected { get; init; }

    /// <summary>
    /// If the specified project has drafting enabled.
    /// </summary>
    /// <remarks>
    /// A <c>true</c> value does not infer that the user has access to drafting,
    /// but that drafting has been configured or can be configured for the project.
    /// </remarks>
    public bool IsDraftingEnabled { get; init; }

    /// <summary>
    /// If the specified project has a draft generated.
    /// </summary>
    public bool HasDraft { get; init; }

    /// <summary>
    /// If the user's role in the project needs to be updated.
    /// </summary>
    public bool HasUserRoleChanged { get; init; }

    /// <summary>
    /// If the project has an update pending on the send/receive server.
    /// </summary>
    public bool HasUpdate { get; init; }

    /// <summary>
    /// A descriptive string of object's properties, for debugging.
    /// </summary>
    /// <returns>
    /// The object's properties
    /// </returns>
    public override string ToString()
    {
        StringBuilder message = new StringBuilder();
        foreach (
            string? item in new string?[]
            {
                ParatextId,
                Name,
                ShortName,
                LanguageRegion,
                LanguageScript,
                LanguageTag,
                ProjectId,
                IsConnectable.ToString(),
                IsConnected.ToString(),
                IsDraftingEnabled.ToString(),
                HasDraft.ToString(),
                IsRightToLeft?.ToString(),
                HasUserRoleChanged.ToString(),
                HasUpdate.ToString(),
            }
        )
        {
            message.Append(item);
            message.Append(',');
        }
        return message.ToString();
    }
}
