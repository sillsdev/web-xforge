using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.Extensions.Localization;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Scripture.Pages.Status;

namespace SIL.XForge.Scripture.Pages;

[TestFixture]
public class ErrorModelTests
{
    [Test]
    public void Localizer_CreatedByFactory()
    {
        var env = new TestEnvironment();
        env.StringLocalizerFactory.Create("Pages.NotFound", Arg.Any<string>())
            .Returns(Substitute.For<IStringLocalizer>());

        // SUT
        IStringLocalizer actual = env.Service.Localizer;
        Assert.NotNull(actual);
        env.StringLocalizerFactory.Received(1).Create("Pages.NotFound", Arg.Any<string>());
    }

    [Test]
    public void OnGet_NotFound()
    {
        var env = new TestEnvironment();
        const int code = 404;

        // SUT
        env.Service.OnGet(code);
        Assert.AreEqual(code, env.Service.ErrorStatusCode);
        Assert.IsTrue(env.Service.RedirectToHome);
    }

    [Test]
    public void OnGet_OtherError()
    {
        var env = new TestEnvironment();
        const int code = 500;

        // SUT
        env.Service.OnGet(code);
        Assert.AreEqual(code, env.Service.ErrorStatusCode);
        Assert.IsFalse(env.Service.RedirectToHome);
    }

    [Test]
    public void SiteOrigin_FromRequest()
    {
        var env = new TestEnvironment
        {
            Service =
            {
                PageContext = new PageContext
                {
                    HttpContext = new DefaultHttpContext
                    {
                        Request = { Scheme = "http", Host = new HostString("localhost", 5000) },
                    },
                },
            },
        };

        // SUT
        string actual = env.Service.SiteOrigin;
        const string expected = "http://localhost:5000";
        Assert.AreEqual(expected, actual);
    }

    private class TestEnvironment
    {
        public TestEnvironment() => Service = new ErrorModel(StringLocalizerFactory);

        public IStringLocalizerFactory StringLocalizerFactory { get; } = Substitute.For<IStringLocalizerFactory>();
        public ErrorModel Service { get; }
    }
}
