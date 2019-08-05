using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace SIL.XForge.Services
{
    public interface IUserService
    {
        Task UpdateUserFromProfileAsync(string userId, JObject userProfile);
        Task LinkParatextAccountAsync(string userId, string primaryAuthId, string secondaryAuthId);
        Task DeleteAsync(string userId);
    }
}
