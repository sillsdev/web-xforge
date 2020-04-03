using System;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Net.Http;
using System.Security.Claims;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using SIL.XForge.Configuration;
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

        public async Task<Tokens> RefreshAccessTokenAsync(ParatextOptions options, Tokens paratextTokens,
            HttpClient client)
        {
            bool expired = !paratextTokens.ValidateLifetime();
            if (!expired)
                return paratextTokens;

            var request = new HttpRequestMessage(HttpMethod.Post, "api8/token");

            var requestObj = new JObject(
                new JProperty("grant_type", "refresh_token"),
                new JProperty("client_id", options.ClientId),
                new JProperty("client_secret", options.ClientSecret),
                new JProperty("refresh_token", paratextTokens.RefreshToken));
            request.Content = new StringContent(requestObj.ToString(), Encoding.UTF8, "application/json");
            HttpResponseMessage response = await client.SendAsync(request);

            string responseJson = await response.Content.ReadAsStringAsync();
            var responseObj = JObject.Parse(responseJson);
            return new Tokens
            {
                AccessToken = (string)responseObj["access_token"],
                RefreshToken = (string)responseObj["refresh_token"]
            };
        }
    }
}
