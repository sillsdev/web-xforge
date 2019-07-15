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
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Services;

namespace SIL.XForge.Controllers
{
    /// <summary>
    /// This is the controller for all JSON-RPC commands on user resources.
    /// </summary>
    [RpcRoute(RootDataTypes.Users)]
    public class UsersRpcController : RpcControllerBase
    {
        private readonly IRepository<UserSecret> _userSecrets;
        private readonly IRealtimeService _realtimeService;
        private readonly IOptions<SiteOptions> _siteOptions;
        private readonly IAuthService _authService;
        private readonly IHostingEnvironment _hostingEnv;
        private const string EMAIL_PATTERN = "^[a-zA-Z0-9.+_-]+@[a-zA-Z0-9.-]+[.]+[a-zA-Z]{2,}$";

        public UsersRpcController(IUserAccessor userAccessor, IHttpRequestAccessor httpRequestAccessor,
            IRepository<UserSecret> userSecrets, IRealtimeService realtimeService,
            IOptions<SiteOptions> siteOptions, IAuthService authService, IHostingEnvironment hostingEnv)
            : base(userAccessor, httpRequestAccessor)
        {
            _userSecrets = userSecrets;
            _realtimeService = realtimeService;
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
            if (ResourceId != UserId || !_hostingEnv.IsDevelopment())
                return ForbiddenError();

            JObject userProfile = await _authService.GetUserAsync(AuthId);
            await UpdateUserFromProfile(userProfile);
            return Ok();
        }

        /// <summary>
        /// Links
        /// </summary>
        public async Task<IRpcMethodResult> LinkParatextAccount(string authId)
        {
            if (ResourceId != UserId)
                return ForbiddenError();

            await _authService.LinkAccounts(AuthId, authId);
            JObject userProfile = await _authService.GetUserAsync(AuthId);
            var identities = (JArray)userProfile["identities"];
            JObject ptIdentity = identities.OfType<JObject>()
                .First(i => (string)i["connection"] == "paratext");
            var ptId = (string)ptIdentity["user_id"];
            var ptTokens = new Tokens
            {
                AccessToken = (string)ptIdentity["access_token"],
                RefreshToken = (string)ptIdentity["refresh_token"]
            };
            await _userSecrets.UpdateAsync(UserId, update => update.Set(us => us.ParatextTokens, ptTokens), true);

            using (IConnection conn = await _realtimeService.ConnectAsync())
            {
                IDocument<User> userDoc = conn.Get<User>(RootDataTypes.Users, UserId);
                await userDoc.FetchAsync();
                await userDoc.SubmitJson0OpAsync(op => op.Set(u => u.ParatextId, ptId.Split('|')[1]));
            }
            return Ok();
        }

        public async Task<IRpcMethodResult> Delete()
        {
            if (SystemRole != SystemRoles.SystemAdmin && ResourceId != UserId)
                return ForbiddenError();

            using (IConnection conn = await _realtimeService.ConnectAsync())
            {
                IDocument<User> userDoc = conn.Get<User>(RootDataTypes.Users, ResourceId);
                await userDoc.FetchAsync();
                await userDoc.DeleteAsync();
            }
            return Ok();
        }

        private async Task UpdateUserFromProfile(JObject userProfile)
        {
            var identities = (JArray)userProfile["identities"];
            JObject ptIdentity = identities.OfType<JObject>()
                .FirstOrDefault(i => (string)i["connection"] == "paratext");
            Regex emailRegex = new Regex(EMAIL_PATTERN);
            using (IConnection conn = await _realtimeService.ConnectAsync())
            {
                DateTime now = DateTime.UtcNow;
                IDocument<User> userDoc = conn.Get<User>(RootDataTypes.Users, UserId);
                await userDoc.FetchAsync();
                if (!userDoc.IsLoaded)
                {
                    await userDoc.CreateAsync(new User
                    {
                        AuthId = (string)userProfile["user_id"]
                    });
                }
                await userDoc.SubmitJson0OpAsync(op =>
                    {
                        string name = emailRegex.IsMatch((string)userProfile["name"])
                            ? ((string)userProfile["name"]).Substring(0, ((string)userProfile["name"]).IndexOf('@'))
                            : (string)userProfile["name"];
                        op.Set(u => u.Name, name);
                        op.Set(u => u.Email, (string)userProfile["email"]);
                        op.Set(u => u.AvatarUrl, (string)userProfile["picture"]);
                        op.Set(u => u.Role, (string)userProfile["app_metadata"]["xf_role"]);
                        if (ptIdentity != null)
                        {
                            var ptId = (string)ptIdentity["user_id"];
                            op.Set(u => u.ParatextId, ptId.Split('|')[1]);
                        }
                        string key = _siteOptions.Value.Id;
                        if (userDoc.Data.Sites.ContainsKey(key))
                            op.Set(u => u.Sites[key].LastLogin, now);
                        else
                            op.Set(u => u.Sites[key], new Site { LastLogin = now });
                    });
            }

            if (ptIdentity != null)
            {
                var newPTTokens = new Tokens
                {
                    AccessToken = (string)ptIdentity["access_token"],
                    RefreshToken = (string)ptIdentity["refresh_token"]
                };
                UserSecret userSecret = await _userSecrets.UpdateAsync(UserId, update => update
                    .SetOnInsert(put => put.ParatextTokens, newPTTokens), true);

                // only update the PT tokens if they are newer
                if (newPTTokens.IssuedAt > userSecret.ParatextTokens.IssuedAt)
                {
                    await _userSecrets.UpdateAsync(UserId,
                        update => update.Set(put => put.ParatextTokens, newPTTokens));
                }
            }
        }
    }
}
