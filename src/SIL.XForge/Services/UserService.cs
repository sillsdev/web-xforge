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
        public static readonly string PTLinkedToAnotherUserKey = "paratext-linked-to-another-user";
        private const string EMAIL_PATTERN = "^[a-zA-Z0-9.+_-]+@[a-zA-Z0-9.-]+[.]+[a-zA-Z]{2,}$";

        private readonly IRealtimeService _realtimeService;
        private readonly IOptions<SiteOptions> _siteOptions;
        private readonly IRepository<UserSecret> _userSecrets;
        private readonly IAuthService _authService;
        private readonly IProjectService _projectService;

        public UserService(
            IRealtimeService realtimeService,
            IOptions<SiteOptions> siteOptions,
            IRepository<UserSecret> userSecrets,
            IAuthService authService,
            IProjectService projectService
        )
        {
            _realtimeService = realtimeService;
            _siteOptions = siteOptions;
            _userSecrets = userSecrets;
            _authService = authService;
            _projectService = projectService;
        }

        public async Task UpdateUserFromProfileAsync(string curUserId, string userProfileJson)
        {
            var userProfile = JObject.Parse(userProfileJson);
            var identities = (JArray)userProfile["identities"];
            JObject ptIdentity = identities
                .OfType<JObject>()
                .FirstOrDefault(i => (string)i["connection"] == "paratext");
            Regex emailRegex = new Regex(EMAIL_PATTERN);
            using (IConnection conn = await _realtimeService.ConnectAsync(curUserId))
            {
                string name = (string)userProfile["name"];
                IDocument<User> userDoc = await conn.FetchOrCreateAsync<User>(
                    curUserId,
                    () =>
                        new User
                        {
                            AuthId = (string)userProfile["user_id"],
                            DisplayName =
                                string.IsNullOrWhiteSpace(name) || emailRegex.IsMatch(name)
                                    ? (string)userProfile["nickname"]
                                    : name
                        }
                );
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
                    string language =
                        userProfile["user_metadata"] == null
                            ? null
                            : (string)userProfile["user_metadata"]["interface_language"];
                    string interfaceLanguage = string.IsNullOrWhiteSpace(language) ? "en" : language;
                    op.Set(u => u.InterfaceLanguage, interfaceLanguage);
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
                UserSecret userSecret = await _userSecrets.UpdateAsync(
                    curUserId,
                    update => update.SetOnInsert(put => put.ParatextTokens, newPTTokens),
                    true
                );

                // Only update the PT tokens if they are newer
                if (newPTTokens.IssuedAt > userSecret.ParatextTokens.IssuedAt)
                {
                    await _userSecrets.UpdateAsync(
                        curUserId,
                        update => update.Set(put => put.ParatextTokens, newPTTokens)
                    );
                }
            }
        }

        /// <summary>
        /// Links the secondary Auth0 account (Paratext account) to the primary Auth0 account for the specified user.
        /// </summary>
        public async Task LinkParatextAccountAsync(string primaryAuthId, string paratextAuthId)
        {
            if (!await CheckIsParatextProfileAndFirstLogin(paratextAuthId))
            {
                // Another auth0 profile already exists that is linked to the paratext account
                throw new ArgumentException(PTLinkedToAnotherUserKey);
            }
            await _authService.LinkAccounts(primaryAuthId, paratextAuthId);
            JObject userProfile = JObject.Parse(await _authService.GetUserAsync(primaryAuthId));
            var primaryUserId = (string)userProfile["app_metadata"]["xf_user_id"];
            var identities = (JArray)userProfile["identities"];
            JObject ptIdentity = identities.OfType<JObject>().First(i => (string)i["connection"] == "paratext");
            var ptId = (string)ptIdentity["user_id"];
            var ptTokens = new Tokens
            {
                AccessToken = (string)ptIdentity["access_token"],
                RefreshToken = (string)ptIdentity["refresh_token"]
            };
            await _userSecrets.UpdateAsync(
                primaryUserId,
                update => update.Set(us => us.ParatextTokens, ptTokens),
                true
            );

            using (IConnection conn = await _realtimeService.ConnectAsync(primaryUserId))
            {
                IDocument<User> userDoc = await conn.FetchAsync<User>(primaryUserId);
                await userDoc.SubmitJson0OpAsync(op => op.Set(u => u.ParatextId, GetIdpIdFromAuthId(ptId)));
            }
        }

        /// <summary>
        /// Updates the interface language in the specified user's Auth0 account in their userMetadata.
        /// </summary>
        public async Task UpdateInterfaceLanguageAsync(string curUserId, string authId, string language)
        {
            await _authService.UpdateInterfaceLanguage(authId, language);

            using (IConnection conn = await _realtimeService.ConnectAsync(curUserId))
            {
                IDocument<User> userDoc = await conn.FetchAsync<User>(curUserId);
                await userDoc.SubmitJson0OpAsync(op => op.Set(u => u.InterfaceLanguage, language));
            }
        }

        /// <summary>
        /// Delete user with SF user id userId, as requested by SF user curUserId who has systemRole.
        /// </summary>
        public async Task DeleteAsync(string curUserId, string systemRole, string userId)
        {
            if (curUserId == null || systemRole == null || userId == null)
            {
                throw new ArgumentNullException();
            }
            if (systemRole != SystemRole.SystemAdmin && userId != curUserId)
            {
                throw new ForbiddenException();
            }

            await _projectService.RemoveUserFromAllProjectsAsync(curUserId, userId);
            await _userSecrets.DeleteAsync(userId);
            using (IConnection conn = await _realtimeService.ConnectAsync(curUserId))
            {
                IDocument<User> userDoc = await conn.FetchAsync<User>(userId);
                await userDoc.DeleteAsync();
            }
            // Remove the actual docs.
            await _realtimeService.DeleteUserAsync(userId);
        }

        /// <summary>
        /// Gets the identity provider ID from the specified Auth0 ID.
        /// </summary>
        private static string GetIdpIdFromAuthId(string authId)
        {
            return authId.Split('|')[1];
        }

        private async Task<bool> CheckIsParatextProfileAndFirstLogin(string authId)
        {
            JObject userProfile = JObject.Parse(await _authService.GetUserAsync(authId));
            // Check that the profile for 'authId' is from a paratext connection. If it is not, then
            // this 'authId' is not from an account with paratext as the primary connection.
            if (!((string)userProfile["user_id"]).Contains("paratext"))
                return false;
            return (int)userProfile["logins_count"] <= 1;
        }
    }
}
