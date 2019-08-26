namespace SIL.XForge.Services
{
    public interface IUserAccessor
    {
        bool IsAuthenticated { get; }
        string UserId { get; }
        string SystemRole { get; }
        string Name { get; }
        string AuthId { get; }
    }
}
