using System;
using System.IdentityModel.Tokens.Jwt;

namespace SIL.XForge.Models;

public class Tokens
{
    public string AccessToken { get; set; }
    public string RefreshToken { get; set; }

    public DateTime IssuedAt
    {
        get
        {
            if (string.IsNullOrWhiteSpace(AccessToken))
            {
                return DateTime.MinValue;
            }
            var accessToken = new JwtSecurityToken(AccessToken);
            return accessToken.Payload.IssuedAt;
        }
    }

    /// <summary>
    /// Checks whether the access token is valid and not about to expire.
    /// </summary>
    public bool ValidateLifetime()
    {
        if (string.IsNullOrWhiteSpace(AccessToken))
        {
            return false;
        }
        var accessToken = new JwtSecurityToken(AccessToken);
        var now = DateTime.UtcNow;
        return now >= accessToken.ValidFrom && now <= accessToken.ValidTo - TimeSpan.FromMinutes(2);
    }
}
