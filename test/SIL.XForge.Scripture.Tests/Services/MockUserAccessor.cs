using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

public record MockUserAccessor : IUserAccessor
{
    public bool IsAuthenticated => false;
    public string UserId { get; init; } = string.Empty;
    public string[] SystemRoles { get; init; } = [];
    public string Name => string.Empty;
    public string AuthId => string.Empty;
}
