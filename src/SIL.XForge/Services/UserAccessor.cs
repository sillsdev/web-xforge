using System.Linq;
using System.Security.Claims;
using Duende.IdentityModel;
using Microsoft.AspNetCore.Http;
using SIL.XForge.Utils;

namespace SIL.XForge.Services;

public class UserAccessor(IHttpContextAccessor httpContextAccessor) : IUserAccessor
{
    private ClaimsPrincipal? User => httpContextAccessor.HttpContext?.User;

    public string AuthId => User?.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? string.Empty;
    public bool IsAuthenticated => User?.Identity?.IsAuthenticated ?? false;
    public string Name
    {
        get
        {
            string name = User?.Identity?.Name;
            if (!string.IsNullOrWhiteSpace(name))
                return name;

            return User?.FindFirst(JwtClaimTypes.Subject)?.Value ?? string.Empty;
        }
    }
    public string[] SystemRoles => GetSystemRoles(User);
    public string UserId => User?.FindFirst(XFClaimTypes.UserId)?.Value ?? string.Empty;

    public static string[] GetSystemRoles(ClaimsPrincipal? user) =>
        user?.FindAll(XFClaimTypes.Role).Select(c => c.Value).ToArray() ?? [];
}
