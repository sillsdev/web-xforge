using System;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using NSubstitute;
using NUnit.Framework;

namespace SIL.XForge.Scripture.Services
{
    [TestFixture]
    public class MachineCorporaServiceTests
    {
        private static readonly string Project01 = "project01";

        [Test]
        public async Task BuildProjectAsync_CallsMachineApiIfTranslationEngineIdPresent()
        {
            // Set up a mock Machine API
            string corporaId = "633fdb281a2e7ac760f7193a";
            var response = $"{{\"id\": \"{corporaId}\",\"href\":\"/corpora/{corporaId}\"}}";
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.OK);
            var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost") };

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            string actual = await env.Service.AddCorporaAsync(Project01);
            Assert.AreEqual(corporaId, actual);
            Assert.AreEqual(1, handler.NumberOfCalls);
        }

        private class TestEnvironment
        {
            public TestEnvironment(HttpClient httpClient = default)
            {
                var httpClientFactory = Substitute.For<IHttpClientFactory>();
                httpClientFactory.CreateClient(Arg.Any<string>()).Returns(httpClient);
                var logger = new MockLogger<MachineProjectService>();

                Service = new MachineCorporaService(httpClientFactory, logger);
            }

            public MachineCorporaService Service { get; }
        }
    }
}
