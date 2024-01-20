namespace SIL.XForge.Services;

public interface IUserAccessor
{
    bool IsAuthenticated { get; }
    string UserId { get; }
    string[] SystemRoles { get; }
    string Name { get; }
    string AuthId { get; }
}
