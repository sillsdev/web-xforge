using System.Net.Http;
using System.Threading.Tasks;
using SIL.XForge.Configuration;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Services
{
    public interface IJwtTokenHelper
    {
        string GetParatextUsername(UserSecret userSecret);
        string GetJwtTokenFromUserSecret(UserSecret userSecret);
        Task<Tokens> GetValidAccessTokenAsync(ParatextOptions options, UserSecret userSecret, HttpClient client);
    }
}
