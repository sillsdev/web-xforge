using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Services
{
    interface IJwtTokenHelper
    {
        string GetParatextUsername(UserSecret userSecret);
        string GetJwtTokenFromUserSecret(UserSecret userSecret);
    }
}
