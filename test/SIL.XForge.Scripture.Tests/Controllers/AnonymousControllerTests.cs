using System;
using System.Net;
using System.Net.Http;
using System.Security;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using NUnit.Framework;
using SIL.XForge.Models;
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
        var request = new GenerateAccountRequest()
        {
            ShareKey = "key01",
            DisplayName = "Test User",
            Language = "en"
        };
        var credentials = new TransparentAuthenticationCredentials { Username = "username", Password = "password" };
        var expectedCookie = new Cookie
        {
            Name = CookieConstants.TransparentAuthentication,
            Value = Uri.EscapeDataString(Newtonsoft.Json.JsonConvert.SerializeObject(credentials))
        };
        env.AnonymousService
            .GenerateAccount(request.ShareKey, request.DisplayName, request.Language)
            .Returns(Task.FromResult(credentials));

        // SUT
        await env.Controller.GenerateAccount(request);

        var headers = env.Controller.Response.Headers;
        Assert.AreEqual(headers.ContainsKey("Set-Cookie"), true);
        StringAssert.StartsWith(expectedCookie.ToString(), headers["Set-Cookie"].ToString());
    }

    [Test]
    public void GenerateAccount_NotFound()
    {
        var env = new TestEnvironment();
        var request = new GenerateAccountRequest()
        {
            ShareKey = "key01",
            DisplayName = "Test User",
            Language = "en"
        };
        env.AnonymousService
            .GenerateAccount(request.ShareKey, request.DisplayName, request.Language)
            .Throws(new DataNotFoundException(""));

        // SUT
        var actual = env.Controller.GenerateAccount(request);
        Assert.IsInstanceOf<NotFoundObjectResult>(actual.Result);
    }

    [Test]
    public void GenerateAccount_NotFound_HttpRequestException()
    {
        var env = new TestEnvironment();
        var request = new GenerateAccountRequest()
        {
            ShareKey = "key01",
            DisplayName = "Test User",
            Language = "en"
        };
        env.AnonymousService
            .GenerateAccount(request.ShareKey, request.DisplayName, request.Language)
            .Throws(new HttpRequestException(""));

        // SUT
        var actual = env.Controller.GenerateAccount(request);
        Assert.IsInstanceOf<NoContentResult>(actual.Result);
    }

    [Test]
    public void GenerateAccount_NotFound_SecurityException()
    {
        var env = new TestEnvironment();
        var request = new GenerateAccountRequest()
        {
            ShareKey = "key01",
            DisplayName = "Test User",
            Language = "en"
        };
        env.AnonymousService
            .GenerateAccount(request.ShareKey, request.DisplayName, request.Language)
            .Throws(new SecurityException());

        // SUT
        var actual = env.Controller.GenerateAccount(request);
        Assert.IsInstanceOf<NoContentResult>(actual.Result);
    }

    [Test]
    public void GenerateAccount_NotFound_TaskCanceledException()
    {
        var env = new TestEnvironment();
        var request = new GenerateAccountRequest()
        {
            ShareKey = "key01",
            DisplayName = "Test User",
            Language = "en"
        };
        env.AnonymousService
            .GenerateAccount(request.ShareKey, request.DisplayName, request.Language)
            .Throws(new TaskCanceledException());

        // SUT
        var actual = env.Controller.GenerateAccount(request);
        Assert.IsInstanceOf<NoContentResult>(actual.Result);
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
