using System;
using System.IdentityModel.Tokens.Jwt;
using Microsoft.IdentityModel.Tokens;

namespace SIL.XForge.Models
{
    public class Tokens
    {
        public string AccessToken { get; set; }
        public string RefreshToken { get; set; }

        public DateTime IssuedAt
        {
            get
            {
                if (AccessToken == null)
                {
                    return DateTime.MinValue;
                }
                var accessToken = new JwtSecurityToken(AccessToken);
                if (accessToken.Payload.Iat != null)
                    return EpochTime.DateTime((long)accessToken.Payload.Iat);
                return DateTime.MinValue;
            }
        }

        /// <summary>
        /// Checks whether the access token is valid and not about to expire within the next minute.
        /// </summary>
        public bool ValidateLifetime()
        {
            if (AccessToken == null)
            {
                return false;
            }
            var accessToken = new JwtSecurityToken(AccessToken);
            var now = DateTime.UtcNow;
            return now >= accessToken.ValidFrom && now <= accessToken.ValidTo - TimeSpan.FromMinutes(1);
        }
    }
}
