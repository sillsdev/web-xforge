using System;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using Newtonsoft.Json.Linq;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;

namespace SIL.XForge.Services
{
    /// <summary>
    /// This class manages xForge users.
    /// </summary>
    public class UserService : IUserService
    {
        private const string EMAIL_PATTERN = "^[a-zA-Z0-9.+_-]+@[a-zA-Z0-9.-]+[.]+[a-zA-Z]{2,}$";

        private readonly IRealtimeService _realtimeService;
        private readonly IOptions<SiteOptions> _siteOptions;
        private readonly IRepository<UserSecret> _userSecrets;
        private readonly IAuthService _authService;

        public UserService(IRealtimeService realtimeService, IOptions<SiteOptions> siteOptions,
            IRepository<UserSecret> userSecrets, IAuthService authService)
        {
            _realtimeService = realtimeService;
            _siteOptions = siteOptions;
            _userSecrets = userSecrets;
            _authService = authService;
        }

        public async Task UpdateUserFromProfileAsync(string userId, JObject userProfile)
        {
            var identities = (JArray)userProfile["identities"];
            JObject ptIdentity = identities.OfType<JObject>()
                .FirstOrDefault(i => (string)i["connection"] == "paratext");
            Regex emailRegex = new Regex(EMAIL_PATTERN);
            using (IConnection conn = await _realtimeService.ConnectAsync())
            {
                DateTime now = DateTime.UtcNow;
                string name = (string)userProfile["name"];
                IDocument<User> userDoc = await conn.FetchOrCreateAsync<User>(userId, () => new User
                {
                    AuthId = (string)userProfile["user_id"],
                    DisplayName = string.IsNullOrWhiteSpace(name) || emailRegex.IsMatch(name) ?
                        (string)userProfile["nickname"] : name
                });
                await userDoc.SubmitJson0OpAsync(op =>
                    {
                        op.Set(u => u.Name, name);
                        op.Set(u => u.Email, (string)userProfile["email"]);
                        op.Set(u => u.AvatarUrl, (string)userProfile["picture"]);
                        op.Set(u => u.Role, (string)userProfile["app_metadata"]["xf_role"]);
                        if (ptIdentity != null)
                        {
                            var ptId = (string)ptIdentity["user_id"];
                            op.Set(u => u.ParatextId, GetIdpIdFromAuthId(ptId));
                        }
                        string key = _siteOptions.Value.Id;
                        if (!userDoc.Data.Sites.ContainsKey(key))
                            op.Set(u => u.Sites[key], new Site());
                    });
            }

            if (ptIdentity != null)
            {
                var newPTTokens = new Tokens
                {
                    AccessToken = (string)ptIdentity["access_token"],
                    RefreshToken = (string)ptIdentity["refresh_token"]
                };
                UserSecret userSecret = await _userSecrets.UpdateAsync(userId, update => update
                    .SetOnInsert(put => put.ParatextTokens, newPTTokens), true);

                // only update the PT tokens if they are newer
                if (newPTTokens.IssuedAt > userSecret.ParatextTokens.IssuedAt)
                {
                    await _userSecrets.UpdateAsync(userId,
                        update => update.Set(put => put.ParatextTokens, newPTTokens));
                }
            }
        }

        /// <summary>
        /// Links the secondary Auth0 account (Paratext account) to the primary Auth0 account for the specified user.
        /// </summary>
        public async Task LinkParatextAccountAsync(string userId, string primaryAuthId, string secondaryAuthId)
        {
            await _authService.LinkAccounts(primaryAuthId, secondaryAuthId);
            JObject userProfile = await _authService.GetUserAsync(primaryAuthId);
            var identities = (JArray)userProfile["identities"];
            JObject ptIdentity = identities.OfType<JObject>()
                .First(i => (string)i["connection"] == "paratext");
            var ptId = (string)ptIdentity["user_id"];
            var ptTokens = new Tokens
            {
                AccessToken = (string)ptIdentity["access_token"],
                RefreshToken = (string)ptIdentity["refresh_token"]
            };
            await _userSecrets.UpdateAsync(userId, update => update.Set(us => us.ParatextTokens, ptTokens), true);

            using (IConnection conn = await _realtimeService.ConnectAsync())
            {
                IDocument<User> userDoc = await conn.FetchAsync<User>(userId);
                await userDoc.SubmitJson0OpAsync(op => op.Set(u => u.ParatextId, GetIdpIdFromAuthId(ptId)));
            }
        }

        public async Task DeleteAsync(string userId)
        {
            using (IConnection conn = await _realtimeService.ConnectAsync())
            {
                IDocument<User> userDoc = await conn.FetchAsync<User>(userId);
                await userDoc.DeleteAsync();
            }
        }

        /// <summary>
        /// Gets the identity provider ID from the specified Auth0 ID.
        /// </summary>
        private static string GetIdpIdFromAuthId(string authId)
        {
            return authId.Split('|')[1];
        }
    }
}
