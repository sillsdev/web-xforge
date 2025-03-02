using SIL.XForge.Services;

namespace SIL.XForge.Models;

/// <summary>
/// A data transfer object for the <see cref="UserAccessor"/>.
/// </summary>
/// <remarks>
/// This is used for JSON deserialization, and unit tests.
/// </remarks>
public record UserAccessorDto : IUserAccessor
{
    public bool IsAuthenticated { get; init; }
    public string UserId { get; init; } = string.Empty;
    public string[] SystemRoles { get; init; } = [];
    public string Name { get; init; } = string.Empty;
    public string AuthId { get; init; } = string.Empty;
}
