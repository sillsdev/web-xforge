using System.Linq;
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

    public async Task<AnonymousShareKeyResponse> CheckSharingKey(string shareKey)
    {
        SFProjectSecret projectSecret = _projectService.GetProjectSecret(shareKey);
        ShareKey projectSecretShareKey = projectSecret.ShareKeys.FirstOrDefault(sk => sk.Key == shareKey);
        if (projectSecretShareKey.RecipientUserId != null || !await _projectService.CheckShareKeyValidity(shareKey))
        {
            throw new ForbiddenException();
        }

        SFProject project = await _projectService.GetProjectAsync(projectSecret.Id);
        return new AnonymousShareKeyResponse
        {
            ProjectName = project.Name,
            Role = projectSecretShareKey.ProjectRole,
            ShareKey = shareKey
        };
    }

    public async Task<TransparentAuthenticationCredentials> GenerateAccount(
        string shareKey,
        string displayName,
        string language
    )
    {
        await CheckSharingKey(shareKey);
        // Generate random username and password for the account
        var credentials = new TransparentAuthenticationCredentials
        {
            Username = _securityService.GenerateKey(),
            Password = _securityService.GenerateKey(16)
        };
        _ = await _authService.GenerateTransparentUser(
            displayName,
            credentials.Username,
            credentials.Password,
            language
        );
        return credentials;
    }
}
