using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using EdjCase.JsonRpc.Router.Abstractions;
using idunno.Authentication.Basic;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using SIL.XForge.Services;

namespace SIL.XForge.Controllers;

/// <summary>
/// This is the controller for all JSON-RPC commands for users.
///
/// When a user logs into SF with a password account, and links that account to a PT account, the following appears to
/// be the typical flow between frontend, backend .net app, and auth0:
///
/// Frontend: User goes to auth0 and logs in.
/// Auth0: Calls SF backend RPC pushAuthUserProfile and sends user back to SF site.
/// Backend: UserService.UpdateUserFromProfileAsync()
/// Frontend: User is at SF and logged in.
/// Frontend: User accesses Connect project, clicks "Log in with Paratext", and authenticates at PT Registry.
/// Auth0: Decides not to immediately link original auth0 account and new PT auth0 account if they do not have the same,
/// verified email address.
/// Auth0: Calls SF backend RPC pushAuthUserProfile (which may not land quite yet?) and sends user back to SF site.
/// Frontend: User is at SF and logged in with new PT auth0 account (if not already linked in auth0).
/// Frontend: auth.service handleOnlineAuth() calls SF backend RPC linkParatextAccount if appropriate.
/// Backend: If the PT auth0 account is new, UserService.LinkParatextAccount asks auth0 to link accounts.
/// Auth0: Links (merges) new PT auth0 account as an identity on original  auth0 account.
/// Frontend: Reloads page. User is at SF and logged in with original  auth0 account.
/// Backend: UserService.UpdateUserFromProfileAsync() applies updates from original auth0 account.
/// </summary>
public class UsersRpcController : RpcControllerBase
{
    private readonly IAuthService _authService;
    private readonly IExceptionHandler _exceptionHandler;
    private readonly IWebHostEnvironment _hostingEnv;
    private readonly IUserService _userService;

    public UsersRpcController(
        IUserAccessor userAccessor,
        IUserService userService,
        IAuthService authService,
        IWebHostEnvironment hostingEnv,
        IExceptionHandler exceptionHandler
    )
        : base(userAccessor, exceptionHandler)
    {
        _userService = userService;
        _authService = authService;
        _hostingEnv = hostingEnv;
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
    /// Updates the current user's entity from the user's corresponding Auth0 profile. This command is used instead
    /// of <see cref="PushAuthUserProfile"/> in development environments, because Auth0 rules cannot call a local
    /// development machine.
    /// </summary>
    public async Task<IRpcMethodResult> PullAuthUserProfile()
    {
        string userProfile = await _authService.GetUserAsync(AuthId);
        await _userService.UpdateUserFromProfileAsync(UserId, userProfile);
        return Ok();
    }

    public async Task<IRpcMethodResult> LinkParatextAccount(string primaryId, string secondaryId)
    {
        try
        {
            await _userService.LinkParatextAccountAsync(primaryId, secondaryId);
            return Ok();
        }
        catch (ArgumentException e)
        {
            return InvalidParamsError(e.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "LinkParatextAccount" },
                    { "primaryId", primaryId },
                    { "secondaryId", secondaryId },
                }
            );
            throw;
        }
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
