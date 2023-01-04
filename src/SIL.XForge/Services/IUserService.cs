using System.Threading.Tasks;

namespace SIL.XForge.Services;

public interface IUserService
{
    Task UpdateUserFromProfileAsync(string curUserId, string userProfileJson);
    Task LinkParatextAccountAsync(string primaryAuthId, string secondaryAuthId);
    Task<string> GetUsernameFromUserId(string curUserId, string userId);
    Task UpdateAvatarFromDisplayNameAsync(string curUserId, string authId);
    Task UpdateInterfaceLanguageAsync(string curUserId, string authId, string language);
    Task DeleteAsync(string curUserId, string systemRole, string userId);
}
