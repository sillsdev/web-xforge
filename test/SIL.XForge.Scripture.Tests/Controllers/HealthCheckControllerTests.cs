using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using NUnit.Framework;
using SIL.XForge.Configuration;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using Options = Microsoft.Extensions.Options.Options;

namespace SIL.XForge.Scripture.Controllers;

[TestFixture]
public class HealthCheckControllerTests
{
    private const string ApiKey = "this_is_a_secret";

    [Test]
    public async Task HealthCheck_FailureWithMongo()
    {
        var env = new TestEnvironment();
        env.RealtimeService.QuerySnapshots<SFProject>().Throws(new ArgumentException());

        // SUT
        var actual = await env.Controller.HealthCheckAsync(ApiKey);

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<ArgumentException>());
        Assert.IsInstanceOf<ObjectResult>(actual.Result);
        var objectResult = (ObjectResult)actual.Result!;
        Assert.AreEqual(HealthController.Status531MongoDown, objectResult.StatusCode);
        var value = (HealthCheckResponse)objectResult.Value!;
        Assert.IsFalse(value.Mongo.Up);
        Assert.AreEqual(HealthCheckResponse.Down, value.StatusSummary);
    }

    [Test]
    public async Task HealthCheck_FailureWithRealtimeServer()
    {
        var env = new TestEnvironment();
        env.RealtimeService.ConnectAsync().Throws(new ArgumentException());

        // SUT
        var actual = await env.Controller.HealthCheckAsync(ApiKey);

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<ArgumentException>());
        Assert.IsInstanceOf<ObjectResult>(actual.Result);
        var objectResult = (ObjectResult)actual.Result!;
        Assert.AreEqual(HealthController.Status532RealtimeServerDown, objectResult.StatusCode);
        var value = (HealthCheckResponse)objectResult.Value!;
        Assert.IsFalse(value.RealtimeServer.Up);
        Assert.AreEqual(HealthCheckResponse.Down, value.StatusSummary);
    }

    [Test]
    public async Task HealthCheck_InvalidKey()
    {
        var env = new TestEnvironment();

        // SUT
        var actual = await env.Controller.HealthCheckAsync("invalid_key");

        Assert.IsInstanceOf<StatusCodeResult>(actual.Result);
        Assert.AreEqual(StatusCodes.Status403Forbidden, (actual.Result as StatusCodeResult)?.StatusCode);
    }

    [Test]
    public async Task HealthCheck_Success()
    {
        var env = new TestEnvironment();

        // SUT
        var actual = await env.Controller.HealthCheckAsync(ApiKey);

        Assert.IsInstanceOf<OkObjectResult>(actual.Result);
        var objectResult = (OkObjectResult)actual.Result!;
        var value = (HealthCheckResponse)objectResult.Value!;
        Assert.AreEqual(HealthCheckResponse.Healthy, value.StatusSummary);
    }

    private class TestEnvironment
    {
        private const string Project01 = "project01";

        public TestEnvironment()
        {
            // Set up the controller and services
            var authOptions = Options.Create(new AuthOptions { HealthCheckApiKey = ApiKey });
            ExceptionHandler = Substitute.For<IExceptionHandler>();
            RealtimeService = Substitute.For<IRealtimeService>();
            Controller = new HealthController(authOptions, ExceptionHandler, RealtimeService);

            // Set up a default project to return from Mongo
            RealtimeService
                .QuerySnapshots<SFProject>()
                .Returns(new List<SFProject> { new SFProject { Id = Project01 } }.AsQueryable());

            // Set up a default connection and document to return from the realtime server
            var connection = Substitute.For<IConnection>();
            var document = Substitute.For<IDocument<SFProject>>();
            document.IsLoaded.Returns(true);
            connection.Get<SFProject>(Project01).Returns(document);
            RealtimeService.ConnectAsync().Returns(Task.FromResult(connection));
        }

        public HealthController Controller { get; }
        public IExceptionHandler ExceptionHandler { get; }
        public IRealtimeService RealtimeService { get; }
    }
}
