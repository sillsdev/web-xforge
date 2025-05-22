using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Configuration;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class EmailServiceTests
{
    [Test]
    public async Task SendEmailAsync_Success()
    {
        var env = new TestEnvironment();

        // SUT
        await env.Service.SendEmailAsync("test@example.com", "Subject", "Body");
        env.MockLogger.AssertHasEvent(e => e.Message!.Contains("Email Sent"));
    }

    [Test]
    public void ValidateEmail_InvalidEmail()
    {
        var env = new TestEnvironment();

        // SUT
        bool actual = env.Service.ValidateEmail("@test@example.com");
        Assert.IsFalse(actual);
    }

    [Test]
    public void ValidateEmail_NullEmail()
    {
        var env = new TestEnvironment();

        // SUT
        bool actual = env.Service.ValidateEmail(null);
        Assert.IsFalse(actual);
    }

    [Test]
    public void ValidateEmail_ValidEmail()
    {
        var env = new TestEnvironment();

        // SUT
        bool actual = env.Service.ValidateEmail("test@example.com");
        Assert.IsTrue(actual);
    }

    private class TestEnvironment
    {
        public TestEnvironment()
        {
            MockLogger = new MockLogger<EmailService>();
            var options = Substitute.For<IOptions<SiteOptions>>();
            options.Value.Returns(
                new SiteOptions
                {
                    EmailFromAddress = "test@localhost",
                    Name = "Scripture Forge Unit Test",
                    PortNumber = "25",
                    SendEmail = false,
                    SmtpServer = "localhost",
                }
            );
            Service = new EmailService(options, MockLogger);
        }

        public MockLogger<EmailService> MockLogger { get; }

        public IEmailService Service { get; }
    }
}
