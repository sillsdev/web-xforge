using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using EdjCase.JsonRpc.Router.Abstractions;
using SIL.XForge.Services;

namespace SIL.XForge.Controllers;

/// <summary>
/// This is the controller for all JSON-RPC commands for users.
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
        try
        {
            string userProfile = await authService.GetUserAsync(AuthId);
            await userService.UpdateUserFromProfileAsync(UserId, userProfile);
            return Ok();
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string> { { "method", "PullAuthUserProfile" } }
            );
            throw;
        }
    }

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
