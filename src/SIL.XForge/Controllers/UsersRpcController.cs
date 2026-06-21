using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using EdjCase.JsonRpc.Router.Abstractions;
using SIL.XForge.Services;

namespace SIL.XForge.Controllers;

/// <summary>
/// This is the controller for all JSON-RPC commands for users.
///
/// When a user logs into SF with a password account, and links that account to a PT account, the following appears to
/// be the typical flow between frontend, backend .net app, and auth0:
///
/// Frontend: User goes to auth0 and logs in.
/// Auth0: Sends user back to SF site.
/// Frontend: User is at SF and logged in.
/// Frontend: auth.service handleOnlineAuth() calls SF backend RPC pullAuthUserProfile.
/// Backend: UserService.UpdateUserFromProfileAsync()
/// Frontend: User accesses Connect project, clicks "Log in with Paratext", and authenticates at PT Registry.
/// Auth0: Decides not to immediately link original auth0 account and new PT auth0 account if they do not have the same,
/// verified email address.
/// Frontend: User is at SF and logged in with new PT auth0 account (if not already linked in auth0).
/// Frontend: auth.service handleOnlineAuth() calls SF backend RPC linkParatextAccount if appropriate. (currently disabled)
/// Backend: If the PT auth0 account is new, UserService.LinkParatextAccount asks auth0 to link accounts.
/// Auth0: Links (merges) new PT auth0 account as an identity on original auth0 account.
/// Frontend: Reloads page. User is at SF and logged in with original auth0 account.
/// Frontend: auth.service handleOnlineAuth() calls SF backend RPC pullAuthUserProfile.
/// Backend: UserService.UpdateUserFromProfileAsync() applies updates from original auth0 account.
/// </summary>
public class UsersRpcController(
    IUserAccessor userAccessor,
    IUserService userService,
    IAuthService authService,
    IExceptionHandler exceptionHandler
) : RpcControllerBase(userAccessor, exceptionHandler)
{
    private readonly IExceptionHandler _exceptionHandler = exceptionHandler;

    /// <summary>
    /// Updates the current user's entity from the user's corresponding Auth0 profile. Called by the front end after
    /// login to ensure the user profile is up to date.
    /// </summary>
    public async Task<IRpcMethodResult> PullAuthUserProfile()
    {
        string userProfile = await authService.GetUserAsync(AuthId);
        await userService.UpdateUserFromProfileAsync(UserId, userProfile);
        return Ok();
    }

    /// <summary>
    /// Linking Paratext accounts is currently disabled.
    /// </summary>
    /// <param name="primaryId">The primary identifier.</param>
    /// <param name="secondaryId">The secondary identifier.</param>
    /// <returns>A forbidden error.</returns>
    public Task<IRpcMethodResult> LinkParatextAccount(string primaryId, string secondaryId) =>
        Task.FromResult(ForbiddenError());

    public async Task<IRpcMethodResult> UpdateAvatarFromDisplayName()
    {
        try
        {
            await userService.UpdateAvatarFromDisplayNameAsync(UserId, AuthId);
            return Ok();
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string> { { "method", "UpdateAvatarFromDisplayName" } }
            );
            throw;
        }
    }

    public async Task<IRpcMethodResult> UpdateInterfaceLanguage(string language)
    {
        try
        {
            await userService.UpdateInterfaceLanguageAsync(UserId, AuthId, language);
            return Ok();
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string> { { "method", "UpdateInterfaceLanguage" }, { "language", language } }
            );
            throw;
        }
    }

    public async Task<IRpcMethodResult> Delete(string userId)
    {
        try
        {
            await userService.DeleteAsync(UserId, SystemRoles, userId);
            return Ok();
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string> { { "method", "Delete" }, { "userId", userId } }
            );

            throw;
        }
    }
}
