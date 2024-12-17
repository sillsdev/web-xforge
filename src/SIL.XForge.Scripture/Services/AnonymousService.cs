using System.Threading.Tasks;
using SIL.XForge.Models;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

public class AnonymousService : IAnonymousService
{
    private readonly IAuthService _authService;
    private readonly ISFProjectService _projectService;
    private readonly ISecurityService _securityService;

    public AnonymousService(
        IAuthService authService,
        ISFProjectService projectService,
        ISecurityService securityService
    )
    {
        _authService = authService;
        _projectService = projectService;
        _securityService = securityService;
    }

    public async Task<AnonymousShareKeyResponse> CheckShareKey(string shareKey)
    {
        ValidShareKey validShareKey = await _projectService.CheckShareKeyValidity(shareKey);

        // Ensure the key hasn't been used by another recipient
        if (validShareKey.ShareKey.RecipientUserId != null)
        {
            throw new DataNotFoundException("key_already_used");
        }

        return new AnonymousShareKeyResponse
        {
            ProjectName = validShareKey.Project.Name,
            Role = validShareKey.ShareKey.ProjectRole,
            ShareKey = shareKey,
        };
    }

    public async Task<TransparentAuthenticationCredentials> GenerateAccount(
        string shareKey,
        string displayName,
        string language
    )
    {
        ValidShareKey validShareKey = await _projectService.CheckShareKeyValidity(shareKey);
        if (validShareKey.Project.MaxGeneratedUsersPerShareKey <= validShareKey.ShareKey.UsersGenerated)
        {
            throw new DataNotFoundException("max_users_reached");
        }
        // Generate random username and password for the account
        var credentials = new TransparentAuthenticationCredentials
        {
            Username = _securityService.GenerateKey(),
            Password = _securityService.GenerateKey(16),
        };
        _ = await _authService.GenerateAnonymousUser(displayName, credentials, language);
        await _projectService.IncreaseShareKeyUsersGenerated(shareKey);
        return credentials;
    }
}
