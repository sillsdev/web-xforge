using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using EdjCase.JsonRpc.Router.Abstractions;
using idunno.Authentication.Basic;
using Microsoft.AspNetCore.Authorization;
using SIL.XForge.Services;

namespace SIL.XForge.Controllers;

/// <summary>
/// This is the controller for all JSON-RPC commands for users.
/// </summary>
public class UsersRpcController : RpcControllerBase
{
    private readonly IAuthService _authService;
    private readonly IExceptionHandler _exceptionHandler;
    private readonly IUserService _userService;

    public UsersRpcController(
        IUserAccessor userAccessor,
        IUserService userService,
        IAuthService authService,
        IExceptionHandler exceptionHandler
    )
        : base(userAccessor, exceptionHandler)
    {
        _userService = userService;
        _authService = authService;
        _exceptionHandler = exceptionHandler;
    }

    /// <summary>
    /// Updates the user entity from the specified Auth0 user profile. Auth0 calls this command from a rule.
    /// </summary>
    [Authorize(AuthenticationSchemes = BasicAuthenticationDefaults.AuthenticationScheme)]
    public Task PushAuthUserProfile(string userId, JsonElement userProfile)
    {
        try
        {
            return _userService.UpdateUserFromProfileAsync(userId, userProfile.ToString());
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string> { { "method", "PushAuthUserProfile" }, { "userId", userId } }
            );
            throw;
        }
    }

    /// <summary>
    /// Updates the current user's entity from the user's corresponding Auth0 profile. Called by the front end after
    /// login to ensure the user profile is up to date.
    /// </summary>
    public async Task<IRpcMethodResult> PullAuthUserProfile()
    {
        string userProfile = await _authService.GetUserAsync(AuthId);
        await _userService.UpdateUserFromProfileAsync(UserId, userProfile);
        return Ok();
    }

    public async Task<IRpcMethodResult> UpdateAvatarFromDisplayName()
    {
        try
        {
            await _userService.UpdateAvatarFromDisplayNameAsync(UserId, AuthId);
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
            await _userService.UpdateInterfaceLanguageAsync(UserId, AuthId, language);
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
            await _userService.DeleteAsync(UserId, SystemRoles, userId);
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
