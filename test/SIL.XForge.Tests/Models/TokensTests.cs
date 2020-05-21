using System;
using NUnit.Framework;

namespace SIL.XForge.Models
{
    [TestFixture]
    public class TokensTests
    {
        [Test]
        public void IssuedAt_MinValueIfNullAccessToken()
        {
            var tokens = new Tokens();
            Assert.That(tokens.AccessToken, Is.Null);
            // SUT
            Assert.That(tokens.IssuedAt, Is.EqualTo(DateTime.MinValue));

            tokens.RefreshToken = "refresh-token-123";
            // SUT 2, where RefreshToken is not null.
            Assert.That(tokens.IssuedAt, Is.EqualTo(DateTime.MinValue));
        }

        [Test]
        public void ValidateLifetime_FalseIfNullAccessToken()
        {
            var tokens = new Tokens();
            Assert.That(tokens.AccessToken, Is.Null);
            // SUT
            Assert.That(tokens.ValidateLifetime(), Is.False);

            tokens.RefreshToken = "refresh-token-123";
            // SUT 2, where RefreshToken is not null.
            Assert.That(tokens.ValidateLifetime(), Is.False);
        }
    }
}
