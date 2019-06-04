using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace SIL.XForge.Services
{
    public interface IAuthService
    {
        bool ValidatePushCredentials(string username, string password);
        Task<JObject> GetUserAsync(string authId);
        Task LinkAccounts(string primaryAuthId, string secondaryAuthId);
    }
}
