using System;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Threading.Tasks;
using IdentityModel;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Newtonsoft.Json.Linq;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;

namespace SIL.XForge.Services
{
    [TestFixture]
    public class UserServiceTests
    {
        [Test]
        public async Task UpdateUserFromProfileAsync_ExistingUser_OldParatextTokens()
        {
            var env = new TestEnvironment();

            JObject userProfile = env.CreateUserProfile("user01", "auth01", env.IssuedAt - TimeSpan.FromMinutes(5));
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

            JObject userProfile = env.CreateUserProfile("user01", "auth01", env.IssuedAt + TimeSpan.FromMinutes(5));
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

            JObject userProfile = env.CreateUserProfile("user03", "auth03", env.IssuedAt);
            await env.Service.UpdateUserFromProfileAsync("user03", userProfile.ToString());
            Assert.That(env.ContainsUser("user03"), Is.True);
            UserSecret userSecret = env.UserSecrets.Get("user03");
            Assert.That(userSecret.ParatextTokens.RefreshToken, Is.EqualTo("new_refresh_token"));
        }

        [Test]
        public async Task PushAuthUserProfile_NewUser_NickNameExtracted()
        {
            var env = new TestEnvironment();

            JObject userProfile = env.CreateUserProfile("user03", "auth03", env.IssuedAt);
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

            JObject userProfile = env.CreateUserProfile("user03", "auth03", env.IssuedAt);
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
            env.AuthService.LinkAccounts("auth02", "auth03").Returns(Task.CompletedTask);
            JObject userProfile = env.CreateUserProfile("user02", "auth02", env.IssuedAt);
            env.AuthService.GetUserAsync("auth02").Returns(Task.FromResult(userProfile.ToString()));
            JObject ptProfile = env.CreateUserProfile("newPtProfile", "paratext|paratext01", env.IssuedAt);
            env.AuthService.GetUserAsync("paratext|paratext01").Returns(Task.FromResult(ptProfile.ToString()));
            Console.WriteLine("Link Account");
            await env.Service.LinkParatextAccountAsync("user02", "auth02", "paratext|paratext01");
            User user2 = env.GetUser("user02");
            Assert.That(user2.ParatextId, Is.EqualTo("paratext01"));
            UserSecret userSecret = env.UserSecrets.Get("user02");
            Assert.That(userSecret.ParatextTokens.RefreshToken, Is.EqualTo("new_refresh_token"));
        }

        [Test]
        public void LinkParatextAccountAsync_ParatextLoginUsingExistingSFUserEmail_ThrowsError()
        {
            var env = new TestEnvironment();
            JObject userProfile = env.CreateUserProfile("user03", "notPt03", env.IssuedAt);
            env.AuthService.GetUserAsync("notPt03").Returns(Task.FromResult(userProfile.ToString()));

            Assert.ThrowsAsync<ArgumentException>(() =>
                env.Service.LinkParatextAccountAsync("user02", "auth02", "notPt03")
            );
        }

        [Test]
        public async Task UpdateInterfaceLanguageAsync()
        {
            var env = new TestEnvironment();
            env.AuthService.UpdateInterfaceLanguage("auth02", "mri").Returns(Task.CompletedTask);
            JObject userProfile = env.CreateUserProfile("user02", "auth02", env.IssuedAt);
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
            Assert.ThrowsAsync<ForbiddenException>(() =>
                env.Service.DeleteAsync(curUserId, curUserSystemRole, userIdToDelete));
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
            env.ProjectService.Received(1).RemoveUserFromAllProjectsAsync(curUserId, userIdToDelete);
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
            public IAuthService AuthService = Substitute.For<IAuthService>();
            public DateTime IssuedAt => DateTime.UtcNow;
            public IProjectService ProjectService = Substitute.For<IProjectService>();

            public TestEnvironment()
            {
                UserSecrets = new MemoryRepository<UserSecret>(new[]
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
                });

                RealtimeService = new MemoryRealtimeService();
                RealtimeService.AddRepository("users", OTType.Json0, new MemoryRepository<User>(new[]
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
                    }
                }));

                var options = Substitute.For<IOptions<SiteOptions>>();
                options.Value.Returns(new SiteOptions
                {
                    Id = "xf",
                    Name = "xForge",
                    Origin = new Uri("http://localhost")
                });

                Service = new UserService(RealtimeService, options, UserSecrets, AuthService, ProjectService);
            }

            public User GetUser(string id)
            {
                return RealtimeService.GetRepository<User>().Get(id);
            }

            public bool ContainsUser(string id)
            {
                return RealtimeService.GetRepository<User>().Contains(id);
            }

            public JObject CreateUserProfile(string userId, string authId, DateTime issuedAt)
            {
                return new JObject(
                    new JProperty("user_id", authId),
                    new JProperty("name", "New User Name"),
                    new JProperty("email", "usernew@example.com"),
                    new JProperty("picture", "http://example.com/new-avatar.png"),
                    new JProperty("app_metadata", new JObject(
                        new JProperty("xf_user_id", userId),
                        new JProperty("xf_role", "user"))),
                    new JProperty("identities", new JArray(
                        new JObject(
                            new JProperty("connection", "paratext"),
                            new JProperty("user_id", "paratext|paratext01"),
                            new JProperty("access_token", TokenHelper.CreateAccessToken(issuedAt)),
                            new JProperty("refresh_token", "new_refresh_token")))),
                    new JProperty("logins_count", 1));
            }
        }
    }
}
