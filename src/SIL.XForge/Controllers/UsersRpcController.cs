using System;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using EdjCase.JsonRpc.Router;
using EdjCase.JsonRpc.Router.Abstractions;
using idunno.Authentication.Basic;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Options;
using Newtonsoft.Json.Linq;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Controllers
{
    /// <summary>
    /// This is the controller for all JSON-RPC commands on user resources.
    /// </summary>
    [RpcRoute(RootDataTypes.Users)]
    public class UsersRpcController : RpcControllerBase
    {
        private readonly IRepository<UserEntity> _users;
        private readonly IOptions<SiteOptions> _siteOptions;
        private readonly IAuthService _authService;
        private readonly IHostingEnvironment _hostingEnv;
        private const string EMAIL_PATTERN = "^[a-zA-Z0-9.+_-]+@[a-zA-Z0-9.-]+[.]+[a-zA-Z]{2,}$";

        public UsersRpcController(IUserAccessor userAccessor, IHttpRequestAccessor httpRequestAccessor,
            IRepository<UserEntity> users, IOptions<SiteOptions> siteOptions, IAuthService authService,
            IHostingEnvironment hostingEnv)
            : base(userAccessor, httpRequestAccessor)
        {
            _users = users;
            _siteOptions = siteOptions;
            _authService = authService;
            _hostingEnv = hostingEnv;
        }

        /// <summary>
        /// Updates the user entity from the specified Auth0 user profile. Auth0 calls this command from a rule.
        /// </summary>
        [Authorize(AuthenticationSchemes = BasicAuthenticationDefaults.AuthenticationScheme)]
        public Task PushAuthUserProfile(JObject userProfile)
        {
            return UpdateUserFromProfile(userProfile);
        }

        /// <summary>
        /// Updates the current user's entity from the user's corresponding Auth0 profile. This command is used instead
        /// of <see cref="PushAuthUserProfile"/> in development environments, because Auth0 rules cannot call a local
        /// development machine.
        /// </summary>
        public async Task<IRpcMethodResult> PullAuthUserProfile()
        {
            if (ResourceId != User.UserId || !_hostingEnv.IsDevelopment())
                return ForbiddenError();

            JObject userProfile = await _authService.GetUserAsync(User.AuthId);
            await UpdateUserFromProfile(userProfile);
            return Ok();
        }

        /// <summary>
        /// Links
        /// </summary>
        public async Task<IRpcMethodResult> LinkParatextAccount(string authId)
        {
            if (ResourceId != User.UserId)
                return ForbiddenError();

            await _authService.LinkAccounts(User.AuthId, authId);
            JObject userProfile = await _authService.GetUserAsync(User.AuthId);
            var identities = (JArray)userProfile["identities"];
            JObject ptIdentity = identities.OfType<JObject>()
                .First(i => (string)i["connection"] == "paratext");
            var ptId = (string)ptIdentity["user_id"];
            var ptTokens = new Tokens
            {
                AccessToken = (string)ptIdentity["access_token"],
                RefreshToken = (string)ptIdentity["refresh_token"]
            };
            await _users.UpdateAsync(ResourceId, update => update
                .Set(u => u.ParatextId, ptId.Split('|')[1])
                .Set(u => u.ParatextTokens, ptTokens));
            return Ok();
        }

        private async Task UpdateUserFromProfile(JObject userProfile)
        {
            var identities = (JArray)userProfile["identities"];
            JObject ptIdentity = identities.OfType<JObject>()
                .FirstOrDefault(i => (string)i["connection"] == "paratext");
            string ptId = null;
            Tokens ptTokens = null;
            if (ptIdentity != null)
            {
                ptId = (string)ptIdentity["user_id"];
                ptTokens = new Tokens
                {
                    AccessToken = (string)ptIdentity["access_token"],
                    RefreshToken = (string)ptIdentity["refresh_token"]
                };
            }
            Regex emailRegex = new Regex(EMAIL_PATTERN);
            UserEntity user = await _users.UpdateAsync(ResourceId, update =>
                {
                    string name = emailRegex.IsMatch((string)userProfile["name"])
                        ? ((string)userProfile["name"]).Substring(0, ((string)userProfile["name"]).IndexOf('@'))
                        : (string)userProfile["name"];
                    update.Set(u => u.Name, name);
                    update.Set(u => u.Email, (string)userProfile["email"]);
                    update.Set(u => u.AvatarUrl, (string)userProfile["picture"]);
                    update.Set(u => u.Role, (string)userProfile["app_metadata"]["xf_role"]);
                    if (ptId != null)
                        update.Set(u => u.ParatextId, ptId.Split('|')[1]);
                    if (ptTokens != null)
                        update.SetOnInsert(u => u.ParatextTokens, ptTokens);
                    string key = _siteOptions.Value.Id;
                    update.Set(u => u.Sites[key].LastLogin, DateTime.UtcNow);
                    string authId = (string)userProfile["user_id"];
                    update.SetOnInsert(u => u.AuthId, authId);
                    if (authId.LastIndexOf('|') >= 0)
                    {
                        string authIdType = authId.Substring(0, authId.LastIndexOf('|'));
                        string authType = null;
                        if (authIdType.Contains("paratext"))
                            authType = "paratext";
                        else if (authIdType.Contains("google"))
                            authType = "google";
                        else if (authIdType.Contains("auth0"))
                            authType = "account";
                        if (authType != null)
                            update.SetOnInsert(u => u.AuthType, authType);
                    }
                    update.SetOnInsert(u => u.Active, true);
                }, true);

            // only update the PT tokens if they are newer
            if (ptTokens != null && (user.ParatextTokens == null || ptTokens.IssuedAt > user.ParatextTokens.IssuedAt))
                await _users.UpdateAsync(ResourceId, update => update.Set(u => u.ParatextTokens, ptTokens));
        }
    }
}
