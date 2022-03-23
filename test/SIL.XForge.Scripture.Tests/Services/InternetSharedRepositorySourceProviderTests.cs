using System;
using Microsoft.Extensions.Options;
using NSubstitute;
using NUnit.Framework;
using Paratext.Data;
using PtxUtils;
using SIL.XForge.Configuration;
using SIL.XForge.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services
{
    [TestFixture]
    public class InternetSharedRepositorySourceProviderTests
    {
        [Test]
        public void GetSource_BadArguments()
        {
            var env = new TestEnvironment();
            Assert.Throws<ArgumentException>(() => env.Provider.GetSource(null, null, null));
            Assert.Throws<ArgumentException>(() => env.Provider.GetSource(null, "abc", "abc"));
            Assert.Throws<ArgumentException>(() => env.Provider.GetSource(new UserSecret(), null, "abc"));
            Assert.Throws<ArgumentException>(() => env.Provider.GetSource(new UserSecret(), "abc", null));
            Assert.Throws<ArgumentException>(() => env.Provider.GetSource(new UserSecret(), string.Empty, "abc"));
            Assert.Throws<ArgumentException>(() => env.Provider.GetSource(new UserSecret(), "abc", string.Empty));
        }

        [Test]
        public void GetSource()
        {
            var env = new TestEnvironment();
            var userSecret = new UserSecret
            {
                Id = "user01",
                ParatextTokens = new Tokens
                {
                    AccessToken = TokenHelper.CreateNewAccessToken(),
                    RefreshToken = "refresh_token01"
                }
            };
            IInternetSharedRepositorySource source = env.Provider.GetSource(userSecret, "srServer", "regServer");
            Assert.That(source, Is.Not.Null);
        }

        [Test]
        public void GetSource_TroubleWithFetchingUsername()
        {
            var env = new TestEnvironment();
            var userSecret = new UserSecret
            {
                Id = "user01",
                ParatextTokens = new Tokens
                {
                    AccessToken = TokenHelper.CreateNewAccessToken(),
                    RefreshToken = "refresh_token01"
                }
            };
            env.MockJwtTokenHelper.GetParatextUsername(Arg.Any<UserSecret>()).Returns((string)null);
            Assert.Throws<Exception>(() => env.Provider.GetSource(userSecret, "srServer", "regServer"));
        }

        private class TestEnvironment
        {
            public IJwtTokenHelper MockJwtTokenHelper;
            public InternetSharedRepositorySourceProvider Provider;

            public TestEnvironment()
            {
                MockJwtTokenHelper = Substitute.For<IJwtTokenHelper>();
                MockJwtTokenHelper.GetJwtTokenFromUserSecret(Arg.Any<UserSecret>()).Returns("token_1234");
                MockJwtTokenHelper.GetParatextUsername(Arg.Any<UserSecret>()).Returns("ptUsernameHere");
                RegistryU.Implementation = new DotNetCoreRegistry();
                InternetAccess.RawStatus = InternetUse.Enabled;
                var siteOptions = Substitute.For<IOptions<SiteOptions>>();
                siteOptions.Value.Returns(new SiteOptions
                {
                    Name = "xForge",
                    Origin = new Uri("http://localhost"),
                    SiteDir = "xforge"
                });
                Provider = new InternetSharedRepositorySourceProvider(MockJwtTokenHelper, siteOptions,
                    Substitute.For<IHgWrapper>());
            }
        }
    }
}
