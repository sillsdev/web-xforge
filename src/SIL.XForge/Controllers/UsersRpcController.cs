using System;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using EdjCase.JsonRpc.Router.Abstractions;
using Microsoft.Extensions.Options;
using Newtonsoft.Json.Linq;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Controllers
{
    public class UsersRpcController : RpcControllerBase
    {
        private readonly IRepository<UserEntity> _users;
        private readonly IOptions<SiteOptions> _siteOptions;
        private readonly AuthService _authService;

        public UsersRpcController(IUserAccessor userAccessor, IHttpRequestAccessor httpRequestAccessor,
            IRepository<UserEntity> users, IOptions<SiteOptions> siteOptions, AuthService authService)
            : base(userAccessor, httpRequestAccessor)
        {
            _users = users;
            _siteOptions = siteOptions;
            _authService = authService;
        }

        public async Task<IRpcMethodResult> UpdateUserFromAuth()
        {
            if (ResourceId != User.UserId)
                return ForbiddenError();

            JObject userObj = await _authService.GetUserAsync(User.AuthId);
            await _users.UpdateAsync(ResourceId, update =>
                {
                    update.Set(u => u.Name, (string)userObj["name"]);
                    var email = (string)userObj["email"];
                    update.Set(u => u.Email, email);
                    update.Set(u => u.CanonicalEmail, UserEntity.CanonicalizeEmail(email));
                    update.Set(u => u.EmailMd5, UserEntity.HashEmail(email));
                    update.Set(u => u.AvatarUrl, (string)userObj["picture"]);
                    var identities = (JArray)userObj["identities"];
                    foreach (JObject identity in identities)
                    {
                        switch ((string)identity["connection"])
                        {
                            case "google-oauth2":
                                update.Set(u => u.GoogleId, (string)identity["user_id"]);
                                break;
                            case "paratext":
                                var ptId = (string)identity["user_id"];
                                update.Set(u => u.ParatextId, ptId.Split('|')[1]);
                                update.Set(u => u.ParatextTokens, new Tokens
                                {
                                    AccessToken = (string)identity["access_token"],
                                    RefreshToken = (string)identity["refresh_token"]
                                });
                                break;
                        }
                    }
                    update.Set(u => u.Sites[_siteOptions.Value.Id].LastLogin, (DateTime)userObj["last_login"]);
                    update.SetOnInsert(u => u.AuthId, User.AuthId);
                    update.SetOnInsert(u => u.Active, true);
                }, true);
            return Ok();
        }

        public async Task<IRpcMethodResult> LinkParatextAccount(string authId)
        {
            if (ResourceId != User.UserId)
                return ForbiddenError();

            await _authService.LinkAccounts(User.AuthId, authId);
            JObject userObj = await _authService.GetUserAsync(User.AuthId);
            var identities = (JArray)userObj["identities"];
            JObject ptIdentity = identities.OfType<JObject>()
                .FirstOrDefault(i => (string)i["connection"] == "paratext");
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
    }
}
