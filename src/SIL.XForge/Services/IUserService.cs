using System.Threading.Tasks;

namespace SIL.XForge.Services
{
    public interface IUserService
    {
        Task UpdateUserFromProfileAsync(string curUserId, string userProfileJson);
        Task LinkParatextAccountAsync(string curUserId, string primaryAuthId, string secondaryAuthId);
        Task UpdateInterfaceLanguageAsync(string curUserId, string authId, string language);
        Task DeleteAsync(string curUserId, string systemRole, string userId);
    }
}
