using System.Threading.Tasks;
using EdjCase.JsonRpc.Router;
using EdjCase.JsonRpc.Router.Abstractions;
using idunno.Authentication.Basic;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Newtonsoft.Json.Linq;
using SIL.XForge.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Controllers
{
    /// <summary>
    /// This is the controller for all JSON-RPC commands for users.
    /// </summary>
    [RpcRoute(RootDataTypes.Users)]
    public class UsersRpcController : RpcControllerBase
    {
        private readonly IAuthService _authService;
        private readonly IHostingEnvironment _hostingEnv;
        private readonly IUserService _userService;

        public UsersRpcController(IUserAccessor userAccessor, IHttpRequestAccessor httpRequestAccessor,
            IUserService userService, IAuthService authService, IHostingEnvironment hostingEnv)
            : base(userAccessor, httpRequestAccessor)
        {
            _userService = userService;
            _authService = authService;
            _hostingEnv = hostingEnv;
        }

        /// <summary>
        /// Updates the user entity from the specified Auth0 user profile. Auth0 calls this command from a rule.
        /// </summary>
        [Authorize(AuthenticationSchemes = BasicAuthenticationDefaults.AuthenticationScheme)]
        public Task PushAuthUserProfile(JObject userProfile)
        {
            return _userService.UpdateUserFromProfileAsync(ResourceId, userProfile);
        }

        /// <summary>
        /// Updates the current user's entity from the user's corresponding Auth0 profile. This command is used instead
        /// of <see cref="PushAuthUserProfile"/> in development environments, because Auth0 rules cannot call a local
        /// development machine.
        /// </summary>
        public async Task<IRpcMethodResult> PullAuthUserProfile()
        {
            if (ResourceId != UserId || !_hostingEnv.IsDevelopment())
                return ForbiddenError();

            JObject userProfile = await _authService.GetUserAsync(AuthId);
            await _userService.UpdateUserFromProfileAsync(ResourceId, userProfile);
            return Ok();
        }

        public async Task<IRpcMethodResult> LinkParatextAccount(string authId)
        {
            if (ResourceId != UserId)
                return ForbiddenError();

            await _userService.LinkParatextAccountAsync(ResourceId, AuthId, authId);
            return Ok();
        }

        public async Task<IRpcMethodResult> Delete()
        {
            if (SystemRole != SystemRoles.SystemAdmin && ResourceId != UserId)
                return ForbiddenError();

            await _userService.DeleteAsync(ResourceId);
            return Ok();
        }
    }
}
