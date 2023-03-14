using System;
using System.Net;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using NUnit.Framework;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Controllers;

[TestFixture]
public class AnonymousControllerTests
{
    [Test]
    public async Task GenerateAccount_CreatesCookie()
    {
        var env = new TestEnvironment();
        string shareKey = "key01";
        string displayName = "Test User";
        string language = "en";
        var credentials = new TransparentAuthenticationCredentials { Username = "username", Password = "password" };
        var expectedCookie = new Cookie
        {
            Name = CookieConstants.TransparentAuthentication,
            Value = Uri.EscapeDataString(Newtonsoft.Json.JsonConvert.SerializeObject(credentials))
        };
        env.AnonymousService.GenerateAccount(shareKey, displayName, language).Returns(Task.FromResult(credentials));

        // SUT
        await env.Controller.GenerateAccount(shareKey, displayName, language);

        var headers = env.Controller.Response.Headers;
        Assert.AreEqual(headers.ContainsKey("Set-Cookie"), true);
        StringAssert.StartsWith(expectedCookie.ToString(), headers["Set-Cookie"].ToString());
    }

    [Test]
    public void GenerateAccount_NotFound()
    {
        var env = new TestEnvironment();
        string shareKey = "key01";
        string displayName = "Test User";
        string language = "en";
        env.AnonymousService.GenerateAccount(shareKey, displayName, language).Throws(new ForbiddenException());

        // SUT
        var actual = env.Controller.GenerateAccount(shareKey, displayName, language);
        Assert.IsInstanceOf<NotFoundObjectResult>(actual.Result);
    }

    private class TestEnvironment
    {
        public readonly IAnonymousService AnonymousService = Substitute.For<IAnonymousService>();
        public readonly IExceptionHandler ExceptionHandler = Substitute.For<IExceptionHandler>();
        public AnonymousController Controller { get; }

        public TestEnvironment()
        {
            Controller = new AnonymousController(AnonymousService, ExceptionHandler);

            // Setup a new context by which we can make queries against
            var response = new HttpResponseFeature();
            var features = new FeatureCollection();
            features.Set<IHttpResponseFeature>(response);
            var context = new DefaultHttpContext(features);
            Controller.ControllerContext.HttpContext = context;
        }
    }
}
