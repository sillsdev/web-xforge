using System;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using IdentityModel;
using Microsoft.IdentityModel.Tokens;

namespace SIL.XForge.Services
{
    /// <summary>
    /// Helper for unit tests using access tokens
    /// </summary>
    public class TokenHelper
    {
        public static string CreateAccessToken(DateTime issuedAt)
        {
            var token = new JwtSecurityToken("ptreg_rsa", "pt-api",
                new[]
                {
                    new Claim(JwtClaimTypes.Subject, "paratext01"),
                    new Claim(JwtClaimTypes.IssuedAt, EpochTime.GetIntDate(issuedAt).ToString())
                },
                expires: issuedAt + TimeSpan.FromMinutes(5));
            var handler = new JwtSecurityTokenHandler();
            return handler.WriteToken(token);
        }

        public static string CreateNewAccessToken()
        {
            return CreateAccessToken(DateTime.Now);
        }
    }
}
