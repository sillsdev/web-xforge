using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace SIL.XForge.Services
{
    public interface IUserService
    {
        Task UpdateUserFromProfileAsync(string curUserId, JObject userProfile);
        Task LinkParatextAccountAsync(string curUserId, string primaryAuthId, string secondaryAuthId);
        Task DeleteAsync(string curUserId, string systemRole, string userId);
    }
}
