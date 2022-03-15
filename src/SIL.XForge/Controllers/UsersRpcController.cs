using System;
using System.Text.Json;
using System.Threading.Tasks;
using EdjCase.JsonRpc.Router.Abstractions;
using idunno.Authentication.Basic;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Hosting;
using SIL.XForge.Services;

namespace SIL.XForge.Controllers
{
    /// <summary>
    /// This is the controller for all JSON-RPC commands for users.
    /// </summary>
    public class UsersRpcController : RpcControllerBase
    {
        private readonly IAuthService _authService;
        private readonly IWebHostEnvironment _hostingEnv;
        private readonly IUserService _userService;

        public UsersRpcController(IUserAccessor userAccessor, IUserService userService, IAuthService authService,
            IWebHostEnvironment hostingEnv) : base(userAccessor)
        {
            _userService = userService;
            _authService = authService;
            _hostingEnv = hostingEnv;
        }

        /// <summary>
        /// Updates the user entity from the specified Auth0 user profile. Auth0 calls this command from a rule.
        /// </summary>
        [Authorize(AuthenticationSchemes = BasicAuthenticationDefaults.AuthenticationScheme)]
        public Task PushAuthUserProfile(string userId, JsonElement userProfile)
        {
            return _userService.UpdateUserFromProfileAsync(userId, userProfile.ToString());
        }

        /// <summary>
        /// Updates the current user's entity from the user's corresponding Auth0 profile. This command is used instead
        /// of <see cref="PushAuthUserProfile"/> in development environments, because Auth0 rules cannot call a local
        /// development machine.
        /// </summary>
        public async Task<IRpcMethodResult> PullAuthUserProfile()
        {
            if (!(_hostingEnv.IsDevelopment()))
                return ForbiddenError();

            string userProfile = await _authService.GetUserAsync(AuthId);
            await _userService.UpdateUserFromProfileAsync(UserId, userProfile);
            return Ok();
        }

        public async Task<IRpcMethodResult> LinkParatextAccount(string authId)
        {
            try
            {
                await _userService.LinkParatextAccountAsync(UserId, AuthId, authId);
                return Ok();
            }
            catch (ArgumentException e)
            {
                return InvalidParamsError(e.Message);
            }
        }

        public async Task<IRpcMethodResult> UpdateInterfaceLanguage(string language)
        {
            await _userService.UpdateInterfaceLanguageAsync(UserId, AuthId, language);
            return Ok();
        }

        public async Task<IRpcMethodResult> Delete(string userId)
        {
            try
            {
                await _userService.DeleteAsync(UserId, SystemRole, userId);
                return Ok();
            }
            catch (ForbiddenException)
            {
                return ForbiddenError();
            }
        }
    }
}
