using System.Diagnostics.CodeAnalysis;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Security.Claims;
using Hangfire.Dashboard;
using Microsoft.IdentityModel.Tokens;
using SIL.XForge.Configuration;
using SIL.XForge.Models;

namespace SIL.XForge.Services;

[ExcludeFromCodeCoverage(Justification = "This logic will only work in the Hangfire context with a valid Auth0 token")]
public class HangfireDashboardAuthorizationFilter(AuthOptions authOptions) : IDashboardAuthorizationFilter
{
    private readonly OpenIdConnectSigningKeyResolver _keyResolver = new OpenIdConnectSigningKeyResolver(
        $"https://{authOptions.Domain}/"
    );

    public bool Authorize(DashboardContext context)
    {
        // Get the access token
        string accessToken = context.GetHttpContext().Request.Cookies["Hangfire"];
        if (string.IsNullOrWhiteSpace(accessToken))
        {
            return false;
        }

        try
        {
            // Validate the token, as this request will not have passed through Microsoft.AspNetCore.Authentication.JwtBearer
            var validationParameters = new TokenValidationParameters
            {
                ValidateAudience = true,
                ValidAudience = authOptions.Audience,
                ValidateIssuer = true,
                ValidateIssuerSigningKey = true,
                ValidIssuer = $"https://{authOptions.Domain}/",
                ValidateLifetime = true,
                IssuerSigningKeyResolver = (_, _, kid, _) => _keyResolver.GetSigningKey(kid),
            };
            var tokenHandler = new JwtSecurityTokenHandler();
            tokenHandler.ValidateToken(accessToken, validationParameters, out SecurityToken validatedToken);
            var token = (JwtSecurityToken)validatedToken;

            // Get the roles from the token
            var user = new ClaimsPrincipal(new ClaimsIdentity(token.Claims));
            return UserAccessor.GetSystemRoles(user).Contains(SystemRole.SystemAdmin);
        }
        catch (SecurityTokenException)
        {
            return false;
        }
    }
}
