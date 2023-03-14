using System.Threading.Tasks;

namespace SIL.XForge.Services;

public interface IAuthService
{
    bool ValidateWebhookCredentials(string username, string password);
    Task<string> GetUserAsync(string authId);
    Task<string> GenerateTransparentUser(string name, string username, string password, string language);
    Task LinkAccounts(string primaryAuthId, string secondaryAuthId);
    Task UpdateAvatar(string authId, string url);
    Task UpdateInterfaceLanguage(string authId, string language);
}
