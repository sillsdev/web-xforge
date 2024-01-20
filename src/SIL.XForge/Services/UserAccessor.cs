using System;
using System.Linq;
using System.Security.Claims;
using IdentityModel;
using Microsoft.AspNetCore.Http;
using SIL.XForge.Utils;

namespace SIL.XForge.Services;

public class UserAccessor : IUserAccessor
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public UserAccessor(IHttpContextAccessor httpContextAccessor) => _httpContextAccessor = httpContextAccessor;

    private ClaimsPrincipal? User => _httpContextAccessor.HttpContext?.User;

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
    public string[] SystemRoles =>
        User?.FindAll(XFClaimTypes.Role).Select(c => c.Value).ToArray() ?? Array.Empty<string>();
    public string UserId => User?.FindFirst(XFClaimTypes.UserId)?.Value ?? string.Empty;
}
