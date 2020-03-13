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
    }
}
