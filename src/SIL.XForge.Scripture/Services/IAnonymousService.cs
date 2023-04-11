using System.Threading.Tasks;
using SIL.XForge.Models;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

public interface IAnonymousService
{
    Task<AnonymousShareKeyResponse> CheckShareKey(string shareKey);
    Task<TransparentAuthenticationCredentials> GenerateAccount(string shareKey, string displayName, string language);
}
