using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Security;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using Microsoft.FeatureManagement;
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
    private const string TestFeatureFlag = "test_feature_flag";

    [Test]
    public async Task FeatureFlags_ReturnsFeatureFlags()
    {
        var env = new TestEnvironment();
        env.FeatureManager.GetFeatureNamesAsync().Returns(TestEnvironment.GetFeatureFlags());
        env.FeatureManager.IsEnabledAsync(TestFeatureFlag).Returns(Task.FromResult(true));

        // SUT
        var actual = await env.Controller.FeatureFlags();

        // Verify result
        Assert.IsInstanceOf<JsonResult>(actual.Result);
        Dictionary<string, bool> featureFlags = (actual.Result as JsonResult)?.Value as Dictionary<string, bool>;
        Assert.IsNotNull(featureFlags);
        Assert.IsTrue(featureFlags![TestFeatureFlag]);
    }

    [Test]
    public async Task GenerateAccount_CreatesCookie()
    {
        var env = new TestEnvironment();
        var request = new GenerateAccountRequest
        {
            ShareKey = "key01",
            DisplayName = "Test User",
            Language = "en",
        };
        var credentials = new TransparentAuthenticationCredentials { Username = "username", Password = "password" };
        var expectedCookie = new Cookie
        {
            Name = CookieConstants.TransparentAuthentication,
            Value = Uri.EscapeDataString(Newtonsoft.Json.JsonConvert.SerializeObject(credentials)),
        };
        env.AnonymousService.GenerateAccount(request.ShareKey, request.DisplayName, request.Language)
            .Returns(Task.FromResult(credentials));

        // SUT
        await env.Controller.GenerateAccount(request);

        var headers = env.Controller.Response.Headers;
        Assert.AreEqual(headers.ContainsKey("Set-Cookie"), true);
        StringAssert.StartsWith(expectedCookie.ToString(), headers.SetCookie.ToString());
    }

    [Test]
    public async Task GenerateAccount_NotFound()
    {
        var env = new TestEnvironment();
        var request = new GenerateAccountRequest
        {
            ShareKey = "key01",
            DisplayName = "Test User",
            Language = "en",
        };
        env.AnonymousService.GenerateAccount(request.ShareKey, request.DisplayName, request.Language)
            .Throws(new DataNotFoundException(string.Empty));

        // SUT
        var actual = await env.Controller.GenerateAccount(request);
        Assert.IsInstanceOf<NotFoundObjectResult>(actual.Result);
    }

    [Test]
    public async Task GenerateAccount_NotFound_HttpRequestException()
    {
        var env = new TestEnvironment();
        var request = new GenerateAccountRequest
        {
            ShareKey = "key01",
            DisplayName = "Test User",
            Language = "en",
        };
        env.AnonymousService.GenerateAccount(request.ShareKey, request.DisplayName, request.Language)
            .Throws(new HttpRequestException(string.Empty));

        // SUT
        var actual = await env.Controller.GenerateAccount(request);
        Assert.IsInstanceOf<NoContentResult>(actual.Result);
    }

    [Test]
    public async Task GenerateAccount_NotFound_SecurityException()
    {
        var env = new TestEnvironment();
        var request = new GenerateAccountRequest
        {
            ShareKey = "key01",
            DisplayName = "Test User",
            Language = "en",
        };
        env.AnonymousService.GenerateAccount(request.ShareKey, request.DisplayName, request.Language)
            .Throws(new SecurityException());

        // SUT
        var actual = await env.Controller.GenerateAccount(request);
        Assert.IsInstanceOf<NoContentResult>(actual.Result);
    }

    [Test]
    public async Task GenerateAccount_NotFound_TaskCanceledException()
    {
        var env = new TestEnvironment();
        var request = new GenerateAccountRequest
        {
            ShareKey = "key01",
            DisplayName = "Test User",
            Language = "en",
        };
        env.AnonymousService.GenerateAccount(request.ShareKey, request.DisplayName, request.Language)
            .Throws(new TaskCanceledException());

        // SUT
        var actual = await env.Controller.GenerateAccount(request);
        Assert.IsInstanceOf<NoContentResult>(actual.Result);
    }

    [Test]
    public async Task Webhook_Exception()
    {
        var env = new TestEnvironment();
        const string signature = "signature_goes_here";
        const string json = "body_goes_here";
        using HttpRequestMessage _ = await env.CreateRequestAsync(json);
        env.MachineApiService.ExecuteWebhookAsync(json, signature).Throws(new DataNotFoundException(string.Empty));

        // SUT
        var actual = await env.Controller.Webhook(signature);

        Assert.IsInstanceOf<NoContentResult>(actual.Result);
        env.ExceptionHandler.Received(1).ReportException(Arg.Any<DataNotFoundException>());
    }

    [Test]
    public async Task Webhook_Success()
    {
        var env = new TestEnvironment();
        const string signature = "signature_goes_here";
        const string json = "body_goes_here";
        using HttpRequestMessage _ = await env.CreateRequestAsync(json);

        // SUT
        var actual = await env.Controller.Webhook(signature);

        Assert.IsInstanceOf<ObjectResult>(actual.Result);
        Assert.AreEqual(StatusCodes.Status200OK, (actual.Result as ObjectResult)?.StatusCode);
        Assert.IsTrue((actual.Result as ObjectResult)?.Value as bool?);
        await env.MachineApiService.Received(1).ExecuteWebhookAsync(json, signature);
    }

    private class TestEnvironment
    {
        public readonly IAnonymousService AnonymousService = Substitute.For<IAnonymousService>();
        public readonly IExceptionHandler ExceptionHandler = Substitute.For<IExceptionHandler>();
        public readonly IFeatureManager FeatureManager = Substitute.For<IFeatureManager>();
        public readonly IMachineApiService MachineApiService = Substitute.For<IMachineApiService>();
        public AnonymousController Controller { get; }

        public TestEnvironment()
        {
            Controller = new AnonymousController(AnonymousService, ExceptionHandler, FeatureManager, MachineApiService);

            // Set up a new context by which we can make queries against
            var response = new HttpResponseFeature();
            var features = new FeatureCollection();
            features.Set<IHttpResponseFeature>(response);
            var context = new DefaultHttpContext(features);
            Controller.ControllerContext.HttpContext = context;
        }

        public static async IAsyncEnumerable<string> GetFeatureFlags()
        {
            yield return TestFeatureFlag;
            await Task.CompletedTask;
        }

        /// <summary>
        /// Creates a Web API request with a string as the body.
        /// </summary>
        /// <param name="body">The body</param>
        /// <returns>The HTTP Request Message.</returns>
        public async Task<HttpRequestMessage> CreateRequestAsync(string body)
        {
            // Add the body to a new request message
            var request = new HttpRequestMessage
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json"),
            };

            // Set up the HTTP context with this data
            Controller.ControllerContext.HttpContext = new DefaultHttpContext
            {
                Request =
                {
                    ContentLength = request.Content.Headers.ContentLength,
                    ContentType = request.Content.Headers.ContentType?.ToString(),
                    Body = await request.Content.ReadAsStreamAsync(),
                    Method = request.Method.Method,
                },
            };

            return request;
        }
    }
}
