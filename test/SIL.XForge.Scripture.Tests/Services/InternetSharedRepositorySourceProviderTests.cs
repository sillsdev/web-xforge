using System;
using NSubstitute;
using NUnit.Framework;
using Paratext.Data;
using PtxUtils;
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
            Assert.Throws<ArgumentException>(() => env.Provider.GetSource(null, null, null, null));
            Assert.Throws<ArgumentException>(() => env.Provider.GetSource(null, "abc", "abc", "abc"));
            Assert.Throws<ArgumentException>(() => env.Provider.GetSource(new UserSecret(), null, "abc", "abc"));
            Assert.Throws<ArgumentException>(() => env.Provider.GetSource(new UserSecret(), "abc", null, "abc"));
            Assert.Throws<ArgumentException>(() => env.Provider.GetSource(new UserSecret(), "abc", "abc", null));
            Assert.Throws<ArgumentException>(() =>
                env.Provider.GetSource(new UserSecret(), string.Empty, "abc", "abc"));
            Assert.Throws<ArgumentException>(() =>
                env.Provider.GetSource(new UserSecret(), "abc", string.Empty, "abc"));
            Assert.Throws<ArgumentException>(() =>
                env.Provider.GetSource(new UserSecret(), "abc", "abc", string.Empty));
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
            IInternetSharedRepositorySource source = env.Provider.GetSource(userSecret, "srServer", "regServer", "1");
            Assert.That(source, Is.Not.Null);
        }

        private class TestEnvironment
        {
            public IJwtTokenHelper MockJwtTokenHelper;
            public InternetSharedRepositorySourceProvider Provider;

            public TestEnvironment()
            {
                MockJwtTokenHelper = Substitute.For<IJwtTokenHelper>();
                MockJwtTokenHelper.GetJwtTokenFromUserSecret(Arg.Any<UserSecret>()).Returns("token_1234");
                RegistryU.Implementation = new DotNetCoreRegistry();
                InternetAccess.RawStatus = InternetUse.Enabled;
                Provider = new InternetSharedRepositorySourceProvider(MockJwtTokenHelper);
            }
        }
    }
}
