using System.Net.Http;
using System.Threading.Tasks;
using SIL.XForge.Configuration;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Services
{
    /// <summary> A mock implementation of IJwtTokenHelper. This is useful for testing. </summary>
    class MockJwtTokenHelper : IJwtTokenHelper
    {
        private string _username;

        public MockJwtTokenHelper(string username)
        {
            _username = username;
        }

        public string GetParatextUsername(UserSecret userSecret)
        {
            return _username;
        }

        public string GetJwtTokenFromUserSecret(UserSecret userSecret)
        {
            return "token_1234";
        }

        public Task<Tokens> RefreshAccessTokenAsync(ParatextOptions options, Tokens paratextTokens, HttpClient client)
        {
            return Task.FromResult(new Tokens { AccessToken = "token_1234", RefreshToken = "refresh_token_1234" });
        }
    }
}
