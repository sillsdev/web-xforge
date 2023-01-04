using System;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using Newtonsoft.Json.Linq;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Utils;

namespace SIL.XForge.Services;

[TestFixture]
public class UserServiceTests
{
    [Test]
    public async Task UpdateUserFromProfileAsync_ExistingUser_OldParatextTokens()
    {
        var env = new TestEnvironment();

        JObject userProfile = TestEnvironment.CreateUserProfile(
            "user01",
            "auth01",
            env.IssuedAt - TimeSpan.FromMinutes(5)
        );
        await env.Service.UpdateUserFromProfileAsync("user01", userProfile.ToString());
        User user1 = env.GetUser("user01");
        Assert.That(user1.Sites.ContainsKey("xf"), Is.True);
        UserSecret userSecret = env.UserSecrets.Get("user01");
        Assert.That(userSecret.ParatextTokens.RefreshToken, Is.EqualTo("refresh_token"));
    }

    [Test]
    public async Task UpdateUserFromProfileAsync_ExistingUser_NewParatextTokens()
    {
        var env = new TestEnvironment();

        JObject userProfile = TestEnvironment.CreateUserProfile(
            "user01",
            "auth01",
            env.IssuedAt + TimeSpan.FromMinutes(5)
        );
        await env.Service.UpdateUserFromProfileAsync("user01", userProfile.ToString());
        User user1 = env.GetUser("user01");
        Assert.That(user1.Sites.ContainsKey("xf"), Is.True);
        UserSecret userSecret = env.UserSecrets.Get("user01");
        Assert.That(userSecret.ParatextTokens.RefreshToken, Is.EqualTo("new_refresh_token"));
    }

    [Test]
    public async Task UpdateUserFromProfileAsync_NewUser()
    {
        var env = new TestEnvironment();

        JObject userProfile = TestEnvironment.CreateUserProfile("user03", "auth03", env.IssuedAt);
        await env.Service.UpdateUserFromProfileAsync("user03", userProfile.ToString());
        Assert.That(env.ContainsUser("user03"), Is.True);
        UserSecret userSecret = env.UserSecrets.Get("user03");
        Assert.That(userSecret.ParatextTokens.RefreshToken, Is.EqualTo("new_refresh_token"));
    }

    [Test]
    public async Task PushAuthUserProfile_NewUser_NickNameExtracted()
    {
        var env = new TestEnvironment();

        JObject userProfile = TestEnvironment.CreateUserProfile("user03", "auth03", env.IssuedAt);
        userProfile["name"] = "usernew@example.com";
        userProfile["nickname"] = "usernew";
        await env.Service.UpdateUserFromProfileAsync("user03", userProfile.ToString());
        User user3 = env.GetUser("user03");
        Assert.That(user3.DisplayName, Is.EqualTo("usernew"));
        UserSecret userSecret = env.UserSecrets.Get("user03");
        Assert.That(userSecret.ParatextTokens.RefreshToken, Is.EqualTo("new_refresh_token"));
    }

    [Test]
    public async Task PushAuthUserProfile_NewUser_NameExtracted()
    {
        var env = new TestEnvironment();

        JObject userProfile = TestEnvironment.CreateUserProfile("user03", "auth03", env.IssuedAt);
        userProfile["name"] = "User New";
        userProfile["nickname"] = "usernew";
        await env.Service.UpdateUserFromProfileAsync("user03", userProfile.ToString());
        User user3 = env.GetUser("user03");
        Assert.That(user3.DisplayName, Is.EqualTo("User New"));
        UserSecret userSecret = env.UserSecrets.Get("user03");
        Assert.That(userSecret.ParatextTokens.RefreshToken, Is.EqualTo("new_refresh_token"));
    }

    [Test]
    public async Task LinkParatextAccountAsync()
    {
        var env = new TestEnvironment();
        env.AuthService.LinkAccounts("auth02", "paratext|paratext01").Returns(Task.CompletedTask);
        JObject userProfile = TestEnvironment.CreateUserProfile("user02", "auth02", env.IssuedAt);
        env.AuthService.GetUserAsync("auth02").Returns(Task.FromResult(userProfile.ToString()));
        JObject ptProfile = TestEnvironment.CreateUserProfile("newPtProfile", "paratext|paratext01", env.IssuedAt);
        env.AuthService.GetUserAsync("paratext|paratext01").Returns(Task.FromResult(ptProfile.ToString()));

        await env.Service.LinkParatextAccountAsync("auth02", "paratext|paratext01");
        User user2 = env.GetUser("user02");
        Assert.That(user2.ParatextId, Is.EqualTo("paratext01"));
        UserSecret userSecret = env.UserSecrets.Get("user02");
        Assert.That(userSecret.ParatextTokens.RefreshToken, Is.EqualTo("new_refresh_token"));
    }

    [Test]
    public void LinkParatextAccountAsync_ParatextLoginUsingExistingSFUserEmail_ThrowsError()
    {
        var env = new TestEnvironment();
        JObject userProfile = TestEnvironment.CreateUserProfile("user03", "notPt03", env.IssuedAt);
        env.AuthService.GetUserAsync("notPt03").Returns(Task.FromResult(userProfile.ToString()));

        Assert.ThrowsAsync<ArgumentException>(() => env.Service.LinkParatextAccountAsync("auth02", "notPt03"));
    }

    [Test]
    public async Task UpdateAvatarFromDisplayNameAsync()
    {
        var env = new TestEnvironment();
        var userId = "user04";
        var userAuth = "auth04";
        await using IConnection conn = await env.RealtimeService.ConnectAsync(userId);
        IDocument<User> userDoc = await conn.FetchAsync<User>(userId);

        string[,] expectedInitials =
        {
            { "User Name", "UN" },
            { "Username", "U" },
            { "User Middle Name", "UN" },
            { "User M Name", "UN" },
            { "U Name", "N" },
            { "1 Number", "N" },
            { "11 Number", "N" },
            { "U", "example" } // Should not change from what is already set
        };
        var expectedAvatarUrl = "";
        User user;

        // Check avatar URL is updated - only happens if the existing URL is one set by Auth0
        for (int i = 0; i < expectedInitials.GetLength(0); i++)
        {
            await userDoc.SubmitJson0OpAsync(op => op.Set(u => u.DisplayName, expectedInitials[i, 0]));
            await env.Service.UpdateAvatarFromDisplayNameAsync(userId, userAuth);
            expectedAvatarUrl = $"https://cdn.auth0.com/avatars/{expectedInitials[i, 1].ToLower()}.png";
            user = env.GetUser(userId);
            Assert.That(user.AvatarUrl, Is.EqualTo(expectedAvatarUrl));
        }

        // Check avatar is not updated if the existing Url is not from Auth0
        expectedAvatarUrl = "https://cdn.google.com/avatars/example.png";
        await userDoc.SubmitJson0OpAsync(op =>
        {
            op.Set(u => u.DisplayName, expectedInitials[0, 0]);
            op.Set(u => u.AvatarUrl, expectedAvatarUrl);
        });
        await env.Service.UpdateAvatarFromDisplayNameAsync(userId, userAuth);
        user = env.GetUser(userId);
        Assert.That(user.AvatarUrl, Is.EqualTo(expectedAvatarUrl));

        // Check avatar Url supports Gravatar if an email is available
        await userDoc.SubmitJson0OpAsync(op =>
        {
            op.Set(u => u.DisplayName, expectedInitials[0, 0]);
            op.Set(u => u.AvatarUrl, "https://cdn.auth0.com/avatars/example.png");
            op.Set(u => u.Email, "example@example.com");
        });
        await env.Service.UpdateAvatarFromDisplayNameAsync(userId, userAuth);
        var emailHash = StringUtils.ComputeMd5Hash(userDoc.Data.Email);
        expectedAvatarUrl = "https://cdn.auth0.com/avatars/un.png";
        var auth0Fallback = System.Web.HttpUtility.UrlEncode(expectedAvatarUrl);
        expectedAvatarUrl = $"https://www.gravatar.com/avatar/{emailHash}?s=480&r=pg&d={auth0Fallback}";
        user = env.GetUser(userId);
        Assert.That(user.AvatarUrl, Is.EqualTo(expectedAvatarUrl));
    }

    [Test]
    public async Task UpdateInterfaceLanguageAsync()
    {
        var env = new TestEnvironment();
        env.AuthService.UpdateInterfaceLanguage("auth02", "mri").Returns(Task.CompletedTask);
        JObject userProfile = TestEnvironment.CreateUserProfile("user02", "auth02", env.IssuedAt);
        env.AuthService.GetUserAsync("auth02").Returns(Task.FromResult(userProfile.ToString()));

        await env.Service.UpdateInterfaceLanguageAsync("user02", "auth02", "mri");
        User user2 = env.GetUser("user02");
        Assert.That(user2.InterfaceLanguage, Is.EqualTo("mri"));
    }

    [Test]
    public void DeleteAsync_BadArguments()
    {
        var env = new TestEnvironment();
        Assert.ThrowsAsync<ArgumentNullException>(() => env.Service.DeleteAsync(null, "systemRole", "userId"));
        Assert.ThrowsAsync<ArgumentNullException>(() => env.Service.DeleteAsync("curUserId", null, "userId"));
        Assert.ThrowsAsync<ArgumentNullException>(() => env.Service.DeleteAsync("curUserId", "systemRole", null));
    }

    [Test]
    public void DeleteAsync_UserCannotDeleteAnotherUser()
    {
        var env = new TestEnvironment();
        string curUserId = "user01";
        // Role is not a system admin
        string curUserSystemRole = SystemRole.User;
        string userIdToDelete = "user02";
        Assert.That(env.ContainsUser(userIdToDelete), Is.True);
        // SUT
        Assert.ThrowsAsync<ForbiddenException>(
            () => env.Service.DeleteAsync(curUserId, curUserSystemRole, userIdToDelete)
        );
        Assert.That(env.RealtimeService.CallCountDeleteUserAsync, Is.EqualTo(0));
    }

    [Test]
    public async Task DeleteAsync_UserCanDeleteSelf()
    {
        var env = new TestEnvironment();
        string curUserId = "user01";
        // Role is not a system admin
        string curUserSystemRole = SystemRole.User;
        string userIdToDelete = "user01";
        Assert.That(env.ContainsUser(userIdToDelete), Is.True);
        // SUT
        await env.Service.DeleteAsync(curUserId, curUserSystemRole, userIdToDelete);
        Assert.That(env.RealtimeService.CallCountDeleteUserAsync, Is.EqualTo(1));
    }

    [Test]
    public async Task DeleteAsync_SysAdminCanDeleteUser()
    {
        var env = new TestEnvironment();
        string curUserId = "user01";
        string curUserSystemRole = SystemRole.SystemAdmin;
        string userIdToDelete = "user02";
        Assert.That(env.ContainsUser(userIdToDelete), Is.True);
        // SUT
        await env.Service.DeleteAsync(curUserId, curUserSystemRole, userIdToDelete);
        Assert.That(env.RealtimeService.CallCountDeleteUserAsync, Is.EqualTo(1));
    }

    [Test]
    public async Task DeleteAsync_SysAdminCanDeleteSelf()
    {
        var env = new TestEnvironment();
        string curUserId = "user01";
        string curUserSystemRole = SystemRole.SystemAdmin;
        string userIdToDelete = "user01";
        Assert.That(env.ContainsUser(userIdToDelete), Is.True);
        // SUT
        await env.Service.DeleteAsync(curUserId, curUserSystemRole, userIdToDelete);
        Assert.That(env.RealtimeService.CallCountDeleteUserAsync, Is.EqualTo(1));
    }

    [Test]
    public async Task DeleteAsync_DisassociatesFromProjects()
    {
        var env = new TestEnvironment();
        string curUserId = "user01";
        string curUserSystemRole = SystemRole.User;
        string userIdToDelete = "user01";
        // SUT
        await env.Service.DeleteAsync(curUserId, curUserSystemRole, userIdToDelete);
        await env.ProjectService.Received(1).RemoveUserFromAllProjectsAsync(curUserId, userIdToDelete);
    }

    [Test]
    public async Task DeleteAsync_RemovesUserSecret()
    {
        var env = new TestEnvironment();
        string curUserId = "user01";
        string curUserSystemRole = SystemRole.User;
        string userIdToDelete = "user01";
        Assert.That(env.UserSecrets.Contains(userIdToDelete), Is.True);
        // SUT
        await env.Service.DeleteAsync(curUserId, curUserSystemRole, userIdToDelete);
        Assert.That(env.UserSecrets.Contains(userIdToDelete), Is.False);
    }

    [Test]
    public async Task DeleteAsync_RequestsDocDeletion()
    {
        // Before just removing the user docs from the database, first call IDocument<User>.DeleteAsync(). This way,
        // clients can be notified of and handle the change. For example, redirecting a deleted user to a landing
        // page.
        var env = new TestEnvironment();
        string curUserId = "user01";
        string curUserSystemRole = SystemRole.User;
        string userIdToDelete = "user01";
        Assert.That(env.ContainsUser(userIdToDelete), Is.True);
        // SUT
        await env.Service.DeleteAsync(curUserId, curUserSystemRole, userIdToDelete);
        Assert.That(env.ContainsUser(userIdToDelete), Is.False);
    }

    private class TestEnvironment
    {
        public UserService Service { get; }
        public MemoryRepository<UserSecret> UserSecrets { get; }
        public MemoryRealtimeService RealtimeService { get; }
        public readonly IAuthService AuthService = Substitute.For<IAuthService>();
        public readonly DateTime IssuedAt = DateTime.UtcNow;
        public readonly IProjectService ProjectService = Substitute.For<IProjectService>();

        public TestEnvironment()
        {
            UserSecrets = new MemoryRepository<UserSecret>(
                new[]
                {
                    new UserSecret
                    {
                        Id = "user01",
                        ParatextTokens = new Tokens
                        {
                            AccessToken = TokenHelper.CreateAccessToken(IssuedAt),
                            RefreshToken = "refresh_token"
                        }
                    }
                }
            );

            RealtimeService = new MemoryRealtimeService();
            RealtimeService.AddRepository(
                "users",
                OTType.Json0,
                new MemoryRepository<User>(
                    new[]
                    {
                        new User
                        {
                            Id = "user01",
                            AvatarUrl = "http://example.com/avatar.png",
                            AuthId = "auth01",
                            ParatextId = "paratext01"
                        },
                        new User
                        {
                            Id = "user02",
                            AvatarUrl = "http://example.com/avatar2.png",
                            AuthId = "auth02"
                        },
                        new User
                        {
                            Id = "user04",
                            AvatarUrl = "https://cdn.auth0.com/avatars/example.png",
                            AuthId = "auth04"
                        }
                    }
                )
            );

            var options = Substitute.For<IOptions<SiteOptions>>();
            options.Value.Returns(
                new SiteOptions
                {
                    Id = "xf",
                    Name = "xForge",
                    Origin = new Uri("http://localhost")
                }
            );

            Service = new UserService(RealtimeService, options, UserSecrets, AuthService, ProjectService);
        }

        public User GetUser(string id) => RealtimeService.GetRepository<User>().Get(id);

        public bool ContainsUser(string id) => RealtimeService.GetRepository<User>().Contains(id);

        public static JObject CreateUserProfile(string userId, string authId, DateTime issuedAt) =>
            new JObject(
                new JProperty("user_id", authId),
                new JProperty("name", "New User Name"),
                new JProperty("email", "usernew@example.com"),
                new JProperty("picture", "http://example.com/new-avatar.png"),
                new JProperty(
                    "app_metadata",
                    new JObject(new JProperty("xf_user_id", userId), new JProperty("xf_role", "user"))
                ),
                new JProperty(
                    "identities",
                    new JArray(
                        new JObject(
                            new JProperty("connection", "paratext"),
                            new JProperty("user_id", "paratext|paratext01"),
                            new JProperty("access_token", TokenHelper.CreateAccessToken(issuedAt)),
                            new JProperty("refresh_token", "new_refresh_token")
                        )
                    )
                ),
                new JProperty("logins_count", 1)
            );
    }
}
