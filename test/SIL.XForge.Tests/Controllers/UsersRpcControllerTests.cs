using System;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Threading.Tasks;
using EdjCase.JsonRpc.Router.Defaults;
using IdentityModel;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Newtonsoft.Json.Linq;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Services;

namespace SIL.XForge.Controllers
{
    [TestFixture]
    public class UsersRpcControllerTests
    {
        [Test]
        public async Task PushAuthUserProfile_ExistingUser_OldParatextTokens()
        {
            var env = new TestEnvironment();
            env.SetUser("user01", "auth01");

            JObject userProfile = env.CreateUserProfile("user01", "auth01", env.IssuedAt - TimeSpan.FromMinutes(5));
            await env.Controller.PushAuthUserProfile(userProfile);
            IDocument<User> userDoc1 = env.GetUserDoc("user01");
            await userDoc1.Received().SubmitOpAsync(Arg.Any<object>());
            UserSecret userSecret = env.UserSecrets.Get("user01");
            Assert.That(userSecret.ParatextTokens.RefreshToken, Is.EqualTo("refresh_token"));
        }

        [Test]
        public async Task PushAuthUserProfile_ExistingUser_NewParatextTokens()
        {
            var env = new TestEnvironment();
            env.SetUser("user01", "auth01");

            JObject userProfile = env.CreateUserProfile("user01", "auth01", env.IssuedAt + TimeSpan.FromMinutes(5));
            await env.Controller.PushAuthUserProfile(userProfile);
            IDocument<User> userDoc1 = env.GetUserDoc("user01");
            await userDoc1.Received().SubmitOpAsync(Arg.Any<object>());
            UserSecret userSecret = env.UserSecrets.Get("user01");
            Assert.That(userSecret.ParatextTokens.RefreshToken, Is.EqualTo("new_refresh_token"));
        }

        [Test]
        public async Task PushAuthUserProfile_NewUser()
        {
            var env = new TestEnvironment();
            env.SetUser("user03", "auth03");

            JObject userProfile = env.CreateUserProfile("user03", "auth03", env.IssuedAt);
            await env.Controller.PushAuthUserProfile(userProfile);
            IDocument<User> userDoc3 = env.GetUserDoc("user03");
            await userDoc3.Received().CreateAsync(Arg.Any<User>());
            await userDoc3.Received().SubmitOpAsync(Arg.Any<object>());
            UserSecret userSecret = env.UserSecrets.Get("user03");
            Assert.That(userSecret.ParatextTokens.RefreshToken, Is.EqualTo("new_refresh_token"));
        }

        [Test]
        public async Task PushAuthUserProfile_NewUser_NameExtracted()
        {
            var env = new TestEnvironment();
            env.SetUser("user03", "auth03");

            JObject userProfile = env.CreateUserProfile("user03", "auth03", env.IssuedAt);
            userProfile["name"] = "usernew@example.com";
            await env.Controller.PushAuthUserProfile(userProfile);
            IDocument<User> userDoc3 = env.GetUserDoc("user03");
            await userDoc3.Received().CreateAsync(Arg.Any<User>());
            await userDoc3.Received().SubmitOpAsync(Arg.Any<object>());
            UserSecret userSecret = env.UserSecrets.Get("user03");
            Assert.That(userSecret.ParatextTokens.RefreshToken, Is.EqualTo("new_refresh_token"));
        }

        [Test]
        public async Task LinkParatextAccount()
        {
            var env = new TestEnvironment();
            env.SetUser("user02", "auth02");
            env.AuthService.LinkAccounts("auth02", "auth03").Returns(Task.CompletedTask);
            JObject userProfile = env.CreateUserProfile("user02", "auth02", env.IssuedAt);
            env.AuthService.GetUserAsync("auth02").Returns(Task.FromResult(userProfile));

            var result = await env.Controller.LinkParatextAccount("auth03") as RpcMethodSuccessResult;
            Assert.That(result, Is.Not.Null);
            IDocument<User> userDoc2 = env.GetUserDoc("user02");
            await userDoc2.Received().SubmitOpAsync(Arg.Any<object>());
            UserSecret userSecret = env.UserSecrets.Get("user02");
            Assert.That(userSecret.ParatextTokens.RefreshToken, Is.EqualTo("new_refresh_token"));
        }

        private class TestEnvironment
        {
            private readonly IConnection _conn;

            public TestEnvironment()
            {
                UserAccessor = Substitute.For<IUserAccessor>();
                HttpRequestAccessor = Substitute.For<IHttpRequestAccessor>();

                UserSecrets = new MemoryRepository<UserSecret>(new[]
                {
                    new UserSecret
                    {
                        Id = "user01",
                        ParatextTokens = new Tokens
                        {
                            AccessToken = CreateAccessToken(IssuedAt),
                            RefreshToken = "refresh_token"
                        }
                    }
                });
                _conn = Substitute.For<IConnection>();
                var userDoc1 = Substitute.For<IDocument<User>>();
                userDoc1.Id.Returns("user01");
                userDoc1.IsLoaded.Returns(true);
                userDoc1.Data.Returns(new User
                {
                    AvatarUrl = "http://example.com/avatar.png",
                    AuthId = "auth01",
                    ParatextId = "paratext01"
                });
                _conn.Get<User>(RootDataTypes.Users, "user01").Returns(userDoc1);
                var userDoc2 = Substitute.For<IDocument<User>>();
                userDoc2.Id.Returns("user02");
                userDoc2.IsLoaded.Returns(true);
                userDoc2.Data.Returns(new User
                {
                    AvatarUrl = "http://example.com/avatar2.png",
                    AuthId = "auth02"
                });
                _conn.Get<User>(RootDataTypes.Users, "user02").Returns(userDoc2);
                var userDoc3 = Substitute.For<IDocument<User>>();
                userDoc3.Id.Returns("user03");
                userDoc3.When(x => x.CreateAsync(Arg.Any<User>())).Do(x =>
                {
                    userDoc3.IsLoaded.Returns(true);
                    userDoc3.Data.Returns(new User());
                });
                _conn.Get<User>(RootDataTypes.Users, "user03").Returns(userDoc3);
                RealtimeService = Substitute.For<IRealtimeService>();
                RealtimeService.ConnectAsync().Returns(Task.FromResult(_conn));

                var options = Substitute.For<IOptions<SiteOptions>>();
                options.Value.Returns(new SiteOptions
                {
                    Id = "xf",
                    Name = "xForge",
                    Origin = new Uri("http://localhost")
                });

                AuthService = Substitute.For<IAuthService>();

                var hostingEnv = Substitute.For<IHostingEnvironment>();

                Controller = new UsersRpcController(UserAccessor, HttpRequestAccessor, UserSecrets, RealtimeService,
                    options, AuthService, hostingEnv);
            }

            public UsersRpcController Controller { get; }
            public IUserAccessor UserAccessor { get; }
            public IHttpRequestAccessor HttpRequestAccessor { get; }
            public MemoryRepository<UserSecret> UserSecrets { get; }
            public IRealtimeService RealtimeService { get; }
            public IAuthService AuthService { get; }
            public DateTime IssuedAt => DateTime.UtcNow;

            public IDocument<User> GetUserDoc(string id)
            {
                return _conn.Get<User>(RootDataTypes.Users, id);
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
                            new JProperty("access_token", CreateAccessToken(issuedAt)),
                            new JProperty("refresh_token", "new_refresh_token")))));
            }

            public void SetUser(string userId, string authId)
            {
                UserAccessor.UserId.Returns(userId);
                UserAccessor.AuthId.Returns(authId);
                PathString path = "/json-api/users/" + userId + "/commands";
                HttpRequestAccessor.Path.Returns(path);
            }

            private string CreateAccessToken(DateTime issuedAt)
            {
                var token = new JwtSecurityToken("ptreg_rsa", "pt-api",
                    new[]
                    {
                        new Claim(JwtClaimTypes.Subject, "paratext01"),
                        new Claim(JwtClaimTypes.IssuedAt, EpochTime.GetIntDate(issuedAt).ToString())
                    },
                    expires: issuedAt + TimeSpan.FromMinutes(5));
                var handler = new JwtSecurityTokenHandler();
                return handler.WriteToken(token);
            }
        }
    }
}
