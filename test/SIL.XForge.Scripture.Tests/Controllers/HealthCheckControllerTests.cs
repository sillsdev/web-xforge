using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using NUnit.Framework;
using Serval.Client;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Controllers;

[TestFixture]
public class HealthCheckControllerTests
{
    [Test]
    public async Task HealthCheck_FailureWithMongo()
    {
        var env = new TestEnvironment();
        env.RealtimeService.QuerySnapshots<SFProject>().Throws(new ArgumentException());

        // SUT
        var actual = await env.Controller.HealthCheckAsync();

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<ArgumentException>());
        Assert.IsInstanceOf<ObjectResult>(actual.Result);
        var objectResult = (ObjectResult)actual.Result!;
        Assert.AreEqual(HealthController.Status531MongoDown, objectResult.StatusCode);
        var value = (HealthCheckResponse)objectResult.Value!;
        Assert.IsFalse(value.Mongo.Up);
    }

    [Test]
    public async Task HealthCheck_FailureWithRealtimeServer()
    {
        var env = new TestEnvironment();
        env.RealtimeService.ConnectAsync().Throws(new ArgumentException());

        // SUT
        var actual = await env.Controller.HealthCheckAsync();

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<ArgumentException>());
        Assert.IsInstanceOf<ObjectResult>(actual.Result);
        var objectResult = (ObjectResult)actual.Result!;
        Assert.AreEqual(HealthController.Status532RealtimeServerDown, objectResult.StatusCode);
        var value = (HealthCheckResponse)objectResult.Value!;
        Assert.IsFalse(value.RealtimeServer.Up);
    }

    [Test]
    public async Task HealthCheck_FailureWithServal()
    {
        var env = new TestEnvironment();
        env.TranslationEnginesClient.GetAllAsync().Throws(new ArgumentException());

        // SUT
        var actual = await env.Controller.HealthCheckAsync();

        env.ExceptionHandler.Received(1).ReportException(Arg.Any<ArgumentException>());
        Assert.IsInstanceOf<ObjectResult>(actual.Result);
        var objectResult = (ObjectResult)actual.Result!;
        Assert.AreEqual(HealthController.Status533ServalDown, objectResult.StatusCode);
        var value = (HealthCheckResponse)objectResult.Value!;
        Assert.IsFalse(value.Serval.Up);
    }

    [Test]
    public async Task HealthCheck_NotLocal()
    {
        var env = new TestEnvironment();
        env.Controller.HttpContext.Connection.RemoteIpAddress = IPAddress.Parse("192.168.0.1");

        // SUT
        var actual = await env.Controller.HealthCheckAsync();

        Assert.IsInstanceOf<ForbidResult>(actual.Result);
    }

    [Test]
    public async Task HealthCheck_SameIp()
    {
        var env = new TestEnvironment();
        var ipAddress = IPAddress.Parse("192.168.0.1");
        env.Controller.HttpContext.Connection.LocalIpAddress = ipAddress;
        env.Controller.HttpContext.Connection.RemoteIpAddress = ipAddress;

        // SUT
        var actual = await env.Controller.HealthCheckAsync();

        Assert.IsInstanceOf<OkObjectResult>(actual.Result);
    }

    [Test]
    public async Task HealthCheck_Success()
    {
        var env = new TestEnvironment();

        // SUT
        var actual = await env.Controller.HealthCheckAsync();

        Assert.IsInstanceOf<OkObjectResult>(actual.Result);
    }

    private class TestEnvironment
    {
        private const string Project01 = "project01";

        public TestEnvironment()
        {
            // Set up the controller and services
            ExceptionHandler = Substitute.For<IExceptionHandler>();
            RealtimeService = Substitute.For<IRealtimeService>();
            TranslationEnginesClient = Substitute.For<ITranslationEnginesClient>();
            Controller = new HealthController(ExceptionHandler, RealtimeService, TranslationEnginesClient)
            {
                ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext(), },
            };

            // Most tests will run as if from localhost
            Controller.HttpContext.Connection.RemoteIpAddress = IPAddress.Loopback;

            // Set up a default project to return from Mongo
            RealtimeService
                .QuerySnapshots<SFProject>()
                .Returns(new List<SFProject> { new SFProject { Id = Project01 } }.AsQueryable());

            // Setup a default connection and document to return from the realtime server
            var connection = Substitute.For<IConnection>();
            var document = Substitute.For<IDocument<SFProject>>();
            document.IsLoaded.Returns(true);
            connection.Get<SFProject>(Project01).Returns(document);
            RealtimeService.ConnectAsync().Returns(Task.FromResult(connection));

            // Setup a default translation engine to return from Serval
            TranslationEnginesClient
                .GetAllAsync()
                .Returns(
                    Task.FromResult<IList<TranslationEngine>>(new List<TranslationEngine> { new TranslationEngine() })
                );
        }

        public HealthController Controller { get; }
        public IExceptionHandler ExceptionHandler { get; }
        public IRealtimeService RealtimeService { get; }
        public ITranslationEnginesClient TranslationEnginesClient { get; }
    }
}
