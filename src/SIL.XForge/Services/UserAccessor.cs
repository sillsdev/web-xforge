using System.Security.Claims;
using IdentityModel;
using Microsoft.AspNetCore.Http;
using SIL.XForge.Utils;

namespace SIL.XForge.Services
{
    public class UserAccessor : IUserAccessor
    {
        private readonly IHttpContextAccessor _httpContextAccessor;

        public UserAccessor(IHttpContextAccessor httpContextAccessor)
        {
            _httpContextAccessor = httpContextAccessor;
        }

        private ClaimsPrincipal User => _httpContextAccessor.HttpContext.User;

        public bool IsAuthenticated => User.Identity.IsAuthenticated;
        public string UserId => User.FindFirst(XFClaimTypes.UserId)?.Value;
        public string SystemRole => User.FindFirst(XFClaimTypes.Role)?.Value;
        public string Name
        {
            get
            {
                string name = User.Identity.Name;
                if (!string.IsNullOrWhiteSpace(name))
                    return name;

                Claim sub = User.FindFirst(JwtClaimTypes.Subject);
                if (sub != null)
                    return sub.Value;

                return string.Empty;
            }
        }

        public string AuthId => User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
    }
}
