using System;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Security.Claims;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Services
{
    /// <summary> Helper methods to access information involving JWT tokens </summary>
    public class JwtTokenHelper : IJwtTokenHelper
    {
        public string GetParatextUsername(UserSecret userSecret)
        {
            if (userSecret.ParatextTokens == null)
                return null;
            var accessToken = new JwtSecurityToken(userSecret.ParatextTokens.AccessToken);
            Claim usernameClaim = accessToken.Claims.FirstOrDefault(c => c.Type == "username");
            return usernameClaim?.Value;
        }

        public string GetJwtTokenFromUserSecret(UserSecret userSecret)
        {
            var jwtToken = userSecret.ParatextTokens.AccessToken;
            if (jwtToken?.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ?? false)
                jwtToken = jwtToken.Substring("Bearer ".Length).Trim();
            return jwtToken;
        }
    }
}
