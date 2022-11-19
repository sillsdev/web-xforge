using NSubstitute;
using NUnit.Framework;
using System.Net;
using System;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services
{
    [TestFixture]
    public class MachineBuildServiceTests
    {
        private static readonly string TranslationEngine01 = "translationEngine01";

        [Test]
        public async Task CancelCurrentBuildAsync_Success()
        {
            // Set up a mock Machine API
            string response = string.Empty;
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.OK);
            var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost") };

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            await env.Service.CancelCurrentBuildAsync(TranslationEngine01, CancellationToken.None);

            Assert.AreEqual(1, handler.NumberOfCalls);
        }

        [Test]
        public void CancelCurrentBuildAsync_NoPermission()
        {
            // Set up a mock Machine API
            string response = string.Empty;
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.Forbidden);
            var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost") };

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            Assert.ThrowsAsync<HttpRequestException>(
                () => env.Service.CancelCurrentBuildAsync(TranslationEngine01, CancellationToken.None)
            );
        }

        [Test]
        public async Task GetCurrentBuildAsync_Success()
        {
            // Set up a mock Machine API
            string buildId = "633fdb281a2e7ac760f7193a";
            string state = "Active";
            string message = "Finalizing";
            int step = 540;
            int revision = 553;
            double percentCompleted = 0.95;
            string response =
                @$"{{
                    ""revision"": {revision},
                    ""parent"": {{
                        ""id"": ""{TranslationEngine01}"",
                        ""href"": ""/translation-engines/{TranslationEngine01}""
                    }},
                    ""step"": {step},
                    ""percentCompleted"": {percentCompleted},
                    ""message"": ""{message}"",
                    ""state"": ""{state}"",
                    ""id"": ""{buildId}"",
                    ""href"": ""/translation-engines/{TranslationEngine01}/builds/{buildId}""
                    }}";
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.OK);
            var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost") };

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            MachineBuildJob? actual = await env.Service.GetCurrentBuildAsync(
                TranslationEngine01,
                minRevision: null,
                CancellationToken.None
            );

            Assert.NotNull(actual);
            Assert.AreEqual(buildId, actual.Id);
            Assert.AreEqual(percentCompleted, actual.PercentCompleted);
            Assert.AreEqual(message, actual.Message);
            Assert.Null(actual.DateFinished);
            Assert.AreEqual(step, actual.Step);
            Assert.AreEqual(revision, actual.Revision);
            Assert.AreEqual(state, actual.State);
            Assert.AreEqual(1, handler.NumberOfCalls);
        }

        [Test]
        public async Task GetCurrentBuildAsync_MinRevision()
        {
            // Set up a mock Machine API
            int minRevision = 553;
            string buildId = "633fdb281a2e7ac760f7193a";
            string state = "Active";
            string message = "Finalizing";
            int step = 540;
            int revision = minRevision + 1;
            double percentCompleted = 0.95;
            string response =
                @$"{{
                    ""revision"": {revision},
                    ""parent"": {{
                        ""id"": ""{TranslationEngine01}"",
                        ""href"": ""/translation-engines/{TranslationEngine01}""
                    }},
                    ""step"": {step},
                    ""percentCompleted"": {percentCompleted},
                    ""message"": ""{message}"",
                    ""state"": ""{state}"",
                    ""id"": ""{buildId}"",
                    ""href"": ""/translation-engines/{TranslationEngine01}/builds/{buildId}""
                    }}";
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.OK);
            var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost") };

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            MachineBuildJob actual = await env.Service.GetCurrentBuildAsync(
                TranslationEngine01,
                minRevision,
                CancellationToken.None
            );

            Assert.NotNull(actual);
            Assert.AreEqual(buildId, actual.Id);
            Assert.AreEqual(percentCompleted, actual.PercentCompleted);
            Assert.AreEqual(message, actual.Message);
            Assert.Null(actual.DateFinished);
            Assert.AreEqual(step, actual.Step);
            Assert.AreEqual(revision, actual.Revision);
            Assert.AreEqual(state, actual.State);
            Assert.AreEqual(1, handler.NumberOfCalls);
        }

        [Test]
        public async Task GetCurrentBuildAsync_NoBuildRunning()
        {
            // Set up a mock Machine API
            string response = string.Empty;
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.NoContent);
            var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost") };

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            MachineBuildJob? actual = await env.Service.GetCurrentBuildAsync(
                TranslationEngine01,
                minRevision: null,
                CancellationToken.None
            );

            Assert.Null(actual);
            Assert.AreEqual(1, handler.NumberOfCalls);
        }

        [Test]
        public void GetCurrentBuildAsync_NoPermission()
        {
            // Set up a mock Machine API
            string response = string.Empty;
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.Forbidden);
            var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost") };

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            Assert.ThrowsAsync<HttpRequestException>(
                () => env.Service.GetCurrentBuildAsync(TranslationEngine01, null, CancellationToken.None)
            );
        }

        [Test]
        public async Task StartBuildAsync_Success()
        {
            // Set up a mock Machine API
            string buildId = "633fdb281a2e7ac760f7193a";
            string state = "Pending";
            int step = 1;
            int revision = 2;
            string response =
                @$"{{
                    ""revision"": {revision},
                    ""parent"": {{
                        ""id"": ""{TranslationEngine01}"",
                        ""href"": ""/translation-engines/{TranslationEngine01}""
                    }},
                    ""step"": {step},
                    ""state"": ""{state}"",
                    ""id"": ""{buildId}"",
                    ""href"": ""/translation-engines/{TranslationEngine01}/builds/{buildId}""
                    }}";
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.OK);
            var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost") };

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            MachineBuildJob actual = await env.Service.StartBuildAsync(TranslationEngine01, CancellationToken.None);

            Assert.AreEqual(buildId, actual.Id);
            Assert.Zero(actual.PercentCompleted);
            Assert.Null(actual.Message);
            Assert.Null(actual.DateFinished);
            Assert.AreEqual(step, actual.Step);
            Assert.AreEqual(revision, actual.Revision);
            Assert.AreEqual(state, actual.State);
            Assert.AreEqual(1, handler.NumberOfCalls);
        }

        [Test]
        public void StartBuildAsync_NoPermission()
        {
            // Set up a mock Machine API
            string response = string.Empty;
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.Forbidden);
            var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost") };

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            Assert.ThrowsAsync<HttpRequestException>(
                () => env.Service.StartBuildAsync(TranslationEngine01, CancellationToken.None)
            );
        }

        private class TestEnvironment
        {
            public TestEnvironment(HttpClient? httpClient = default)
            {
                var httpClientFactory = Substitute.For<IHttpClientFactory>();
                httpClientFactory.CreateClient(Arg.Any<string>()).Returns(httpClient);
                var logger = new MockLogger<MachineBuildService>();

                Service = new MachineBuildService(httpClientFactory, logger);
            }

            public MachineBuildService Service { get; }
        }
    }
}
