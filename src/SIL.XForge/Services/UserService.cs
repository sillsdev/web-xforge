using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Newtonsoft.Json.Linq;
using SIL.Extensions;
using SIL.ObjectModel;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Utils;

namespace SIL.XForge.Services;

/// <summary>
/// This class manages xForge users.
/// </summary>
public class UserService : IUserService
{
    private const string PTLinkedToAnotherUserKey = "paratext-linked-to-another-user";
    private const string EMAIL_PATTERN = "^[a-zA-Z0-9.+_-]+@[a-zA-Z0-9.-]+[.]+[a-zA-Z]{2,}$";
    private static readonly IEqualityComparer<IList<string>> _listStringComparer = SequenceEqualityComparer.Create(
        EqualityComparer<string>.Default
    );

    private readonly IRealtimeService _realtimeService;
    private readonly IOptions<SiteOptions> _siteOptions;
    private readonly IRepository<UserSecret> _userSecrets;
    private readonly IAuthService _authService;
    private readonly IProjectService _projectService;
    private readonly ILogger<UserService> _logger;

    public UserService(
        IRealtimeService realtimeService,
        IOptions<SiteOptions> siteOptions,
        IRepository<UserSecret> userSecrets,
        IAuthService authService,
        IProjectService projectService,
        ILogger<UserService> logger
    )
    {
        _realtimeService = realtimeService;
        _siteOptions = siteOptions;
        _userSecrets = userSecrets;
        _authService = authService;
        _projectService = projectService;
        _logger = logger;
    }

    public async Task UpdateUserFromProfileAsync(string curUserId, string userProfileJson)
    {
        var userProfile = JObject.Parse(userProfileJson);
        var identities = (JArray)userProfile["identities"];
        JObject ptIdentity = identities.OfType<JObject>().FirstOrDefault(i => (string)i["connection"] == "paratext");
        bool displayNameSetAtSignup = identities
            .OfType<JObject>()
            .Any(i => (string)i["connection"] == "Transparent-Authentication");
        Regex emailRegex = new Regex(EMAIL_PATTERN);
        await using (IConnection conn = await _realtimeService.ConnectAsync(curUserId))
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
                                : name,
                        IsDisplayNameConfirmed = displayNameSetAtSignup,
                    }
            );
            await userDoc.SubmitJson0OpAsync(op =>
            {
                string picture = (string)userProfile["user_metadata"]?["picture"];
                string avatarUrl = string.IsNullOrWhiteSpace(picture) ? (string)userProfile["picture"] : picture;
                op.Set(u => u.Name, name);
                op.Set(u => u.Email, (string)userProfile["email"]);
                op.Set(u => u.AvatarUrl, avatarUrl);
                List<string> roles = [];
                if (userProfile["app_metadata"]?["xf_role"] is JArray)
                {
                    roles.AddRange(userProfile["app_metadata"]["xf_role"].Select(r => r.ToString()));
                }
                else
                {
                    string? role = (string?)userProfile["app_metadata"]?["xf_role"];
                    if (role is not null)
                    {
                        roles.Add(role);
                    }
                }
                op.Set(u => u.Roles, roles, _listStringComparer);
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
                RefreshToken = (string)ptIdentity["refresh_token"],
            };
            UserSecret userSecret = await _userSecrets.UpdateAsync(
                curUserId,
                update => update.SetOnInsert(put => put.ParatextTokens, newPTTokens),
                true
            );

            // Only update the PT tokens if they are newer
            if (newPTTokens.IssuedAt > userSecret.ParatextTokens.IssuedAt)
            {
                await _userSecrets.UpdateAsync(curUserId, update => update.Set(put => put.ParatextTokens, newPTTokens));
            }
            else if (newPTTokens.IssuedAt < userSecret.ParatextTokens.IssuedAt)
            {
                string incomingIAt = newPTTokens.IssuedAt.ToString(
                    "o",
                    System.Globalization.CultureInfo.InvariantCulture
                );
                string currentIAt = userSecret.ParatextTokens.IssuedAt.ToString(
                    "o",
                    System.Globalization.CultureInfo.InvariantCulture
                );
                _logger.LogWarning(
                    $"When updating user with SF id {curUserId} from auth0 profile, ignoring incoming tokens which were issued at {incomingIAt}, which is earlier than the current tokens {currentIAt}."
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

        JObject secondaryAuth0UserProfile = JObject.Parse(await _authService.GetUserAsync(paratextAuthId));
        string secondarySFUserId = (string)secondaryAuth0UserProfile["app_metadata"]["xf_user_id"];

        await _authService.LinkAccounts(primaryAuthId, paratextAuthId);
        JObject userProfile = JObject.Parse(await _authService.GetUserAsync(primaryAuthId));
        var primaryUserId = (string)userProfile["app_metadata"]["xf_user_id"];
        var identities = (JArray)userProfile["identities"];
        JObject ptIdentity = identities.OfType<JObject>().First(i => (string)i["connection"] == "paratext");
        var ptId = (string)ptIdentity["user_id"];
        var ptTokens = new Tokens
        {
            AccessToken = (string)ptIdentity["access_token"],
            RefreshToken = (string)ptIdentity["refresh_token"],
        };
        await _userSecrets.UpdateAsync(primaryUserId, update => update.Set(us => us.ParatextTokens, ptTokens), true);

        await using IConnection conn = await _realtimeService.ConnectAsync(primaryUserId);
        IDocument<User> userDoc = await conn.FetchAsync<User>(primaryUserId);
        await userDoc.SubmitJson0OpAsync(op => op.Set(u => u.ParatextId, GetIdpIdFromAuthId(ptId)));
        IDocument<User> secondaryUserDoc = await conn.FetchAsync<User>(secondarySFUserId);
        if (secondaryUserDoc.Data != null)
        {
            this._logger.LogInformation(
                $"UserService.LinkParatextAccountAsync() will remove the paratextId and tokens from SF user id {secondarySFUserId}. Perhaps a race condition occurred, resulting in a situation like SF-1849. This secondary SF user and associated user_secret can probably be deleted."
            );
            await secondaryUserDoc.SubmitJson0OpAsync(op => op.Set(u => u.ParatextId, null));
        }

        await _userSecrets.UpdateAsync(secondarySFUserId, update => update.Set(us => us.ParatextTokens, null));
    }

    /// <summary>
    /// Updates the user avatar on their Auth0 account based off their display name
    /// </summary>
    public async Task UpdateAvatarFromDisplayNameAsync(string curUserId, string authId)
    {
        await using IConnection conn = await _realtimeService.ConnectAsync(curUserId);
        IDocument<User> userDoc = await conn.FetchAsync<User>(curUserId);
        // Only overwrite the avatar for allowed domains so as not to overwrite an avatar provided by a social connection
        string[] allowedDomains = ["cdn.auth0.com", "gravatar.com"];
        if (!allowedDomains.Any(userDoc.Data.AvatarUrl.Contains))
        {
            return;
        }

        string initials = string.Concat(
            userDoc
                .Data.DisplayName.Split(' ', StringSplitOptions.RemoveEmptyEntries)
                .Where(x => x.Length > 1 && char.IsLetter(x[0]))
                .Select(x => char.ToLowerInvariant(x[0]))
        );
        if (initials.Length == 0)
        {
            return;
        }
        else if (initials.Length > 2)
        {
            // Auth0 avatar images only support 2 characters
            initials = $"{initials[0]}{initials[^1]}";
        }
        var avatarUrl = $"https://cdn.auth0.com/avatars/{initials}.png";
        // If user has an email then link to Gravatar with auth0 as a fallback
        if (userDoc.Data.Email != null && userDoc.Data.Email != "")
        {
            var emailHash = StringUtils.ComputeMd5Hash(userDoc.Data.Email);
            var auth0Fallback = System.Web.HttpUtility.UrlEncode(avatarUrl);
            avatarUrl = $"https://www.gravatar.com/avatar/{emailHash}?s=480&r=pg&d={auth0Fallback}";
        }
        // Update Auth0 profile
        await _authService.UpdateAvatar(authId, avatarUrl);
        // Update user doc
        await userDoc.SubmitJson0OpAsync(op => op.Set(u => u.AvatarUrl, avatarUrl));
    }

    /// <summary>
    /// Updates the interface language in the specified user's Auth0 account in their userMetadata.
    /// </summary>
    public async Task UpdateInterfaceLanguageAsync(string curUserId, string authId, string language)
    {
        await _authService.UpdateInterfaceLanguage(authId, language);

        await using IConnection conn = await _realtimeService.ConnectAsync(curUserId);
        IDocument<User> userDoc = await conn.FetchAsync<User>(curUserId);
        await userDoc.SubmitJson0OpAsync(op => op.Set(u => u.InterfaceLanguage, language));
    }

    /// <summary>
    /// Delete user with SF user id userId, as requested by SF user curUserId who has systemRole.
    /// </summary>
    public async Task DeleteAsync(string curUserId, string[] systemRoles, string userId)
    {
        if (curUserId is null)
        {
            throw new ArgumentNullException(nameof(curUserId));
        }

        if (userId is null)
        {
            throw new ArgumentNullException(nameof(userId));
        }

        if (!systemRoles.Contains(SystemRole.SystemAdmin) && userId != curUserId)
        {
            throw new ForbiddenException();
        }

        await _projectService.RemoveUserFromAllProjectsAsync(curUserId, userId);
        await _userSecrets.DeleteAsync(userId);
        await using (IConnection conn = await _realtimeService.ConnectAsync(curUserId))
        {
            IDocument<User> userDoc = await conn.FetchAsync<User>(userId);
            await userDoc.DeleteAsync();
        }
        // Remove the actual docs.
        await _realtimeService.DeleteUserAsync(userId);
    }

    public async Task<string> GetUsernameFromUserId(string curUserId, string userId)
    {
        await using IConnection conn = await _realtimeService.ConnectAsync(curUserId);
        IDocument<User> userDoc = await conn.FetchAsync<User>(userId);
        return userDoc.Data.DisplayName;
    }

    public async Task<Dictionary<string, string>> DisplayNamesFromUserIds(string curUserId, string[] userIds)
    {
        await using IConnection conn = await _realtimeService.ConnectAsync(curUserId);
        IReadOnlyCollection<IDocument<User>> userDocs = await conn.GetAndFetchDocsAsync<User>(userIds);
        return userDocs.ToDictionary(u => u.Id, u => u.Data.DisplayName);
    }

    /// <summary>
    /// Gets the identity provider ID from the specified Auth0 ID.
    /// </summary>
    private static string GetIdpIdFromAuthId(string authId) => authId.Split('|')[1];

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
