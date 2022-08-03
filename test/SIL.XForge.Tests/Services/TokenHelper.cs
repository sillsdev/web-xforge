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
        public static string CreateAccessToken(DateTime issuedAt, DateTime expiration, string paratextUserId)
        {
            var token = new JwtSecurityToken(
                "ptreg_rsa",
                "pt-api",
                new[]
                {
                    new Claim(JwtClaimTypes.Subject, paratextUserId),
                    new Claim(JwtClaimTypes.IssuedAt, EpochTime.GetIntDate(issuedAt).ToString())
                },
                expires: expiration
            );
            var handler = new JwtSecurityTokenHandler();
            return handler.WriteToken(token);
        }

        public static string CreateAccessToken(DateTime issuedAt)
        {
            return CreateAccessToken(issuedAt, issuedAt + TimeSpan.FromMinutes(5), "paratext01");
        }

        public static string CreateNewAccessToken()
        {
            return CreateAccessToken(DateTime.Now);
        }
    }
}
