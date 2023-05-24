using System.Threading.Tasks;
using SIL.XForge.Models;

namespace SIL.XForge.Services;

public interface IAuthService
{
    bool ValidateWebhookCredentials(string username, string password);
    Task<string> GetUserAsync(string authId);
    Task<string> GenerateAnonymousUser(string name, TransparentAuthenticationCredentials credentials, string language);
    Task LinkAccounts(string primaryAuthId, string secondaryAuthId);
    Task UpdateAvatar(string authId, string url);
    Task UpdateInterfaceLanguage(string authId, string language);
    Task<string> UpdateUserToAnonymous(string authId);
}
