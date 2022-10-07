using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services
{
    [TestFixture]
    public class MachineCorporaServiceTests
    {
        private static readonly string Project01 = "project01";

        [Test]
        public async Task AddCorpusAsync_Success()
        {
            // Set up a mock Machine API
            string corpusId = "633fdb281a2e7ac760f7193a";
            var response = $"{{\"id\": \"{corpusId}\",\"href\":\"/corpora/{corpusId}\"}}";
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.OK);
            var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost") };

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            string actual = await env.Service.AddCorpusAsync(Project01, CancellationToken.None);
            Assert.AreEqual(corpusId, actual);
            Assert.AreEqual(1, handler.NumberOfCalls);
        }

        [Test]
        public async Task AddCorpusToTranslationEngineAsync_Success()
        {
            // Set up a mock Machine API
            string translationEngineId = "63372e670935fe633f927c85";
            string corpusId = "633fdb281a2e7ac760f7193a";
            var response =
                @$"{{
                  ""href"": ""/translation-engines/{translationEngineId}/corpora/{corpusId}"",
                  ""corpus"": {{
                    ""id"": ""{corpusId}"",
                    ""href"": ""/corpora/{corpusId}""
                  }},
                  ""pretranslate"": false
                }}";
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.OK);
            var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost") };

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            bool actual = await env.Service.AddCorpusToTranslationEngineAsync(
                translationEngineId,
                corpusId,
                false,
                CancellationToken.None
            );
            Assert.IsTrue(actual);
            Assert.AreEqual(1, handler.NumberOfCalls);
        }

        [Test]
        public void UploadParatextCorpusAsync_DirectoryNotFound()
        {
            // Set up test environment
            var env = new TestEnvironment();
            string corpusId = "633fdb281a2e7ac760f7193a";
            env.FileSystemService.DirectoryExists(Arg.Any<string>()).Returns(false);

            // SUT
            Assert.ThrowsAsync<DirectoryNotFoundException>(
                () => env.Service.UploadParatextCorpusAsync(corpusId, "en", "an_invalid_path", CancellationToken.None)
            );
        }

        [Test]
        public async Task UploadParatextCorpusAsync_Success()
        {
            // Set up a mock Machine API
            string fileId = "634089bd1706669dc1acf6a4";
            string corpusId = "633fdb281a2e7ac760f7193a";
            string name = "my_project";
            var response =
                @$"{{
                  ""languageTag"": ""en"",
                  ""name"": ""{name}"",
                  ""id"": ""{fileId}"",
                  ""href"": ""/corpora/{corpusId}/files/{fileId}""
                }}";
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.OK);
            var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost") };

            // Set up test environment
            var env = new TestEnvironment(httpClient);
            string fileName = "sample.txt";
            string path = Path.Combine("a_valid_path", name);
            string filePath = Path.Combine(path, fileName);
            env.FileSystemService.DirectoryExists(path).Returns(true);
            env.FileSystemService.EnumerateFiles(path).Returns(new[] { filePath });
            env.FileSystemService
                .OpenFile(filePath, FileMode.Open)
                .Returns(new MemoryStream(Encoding.UTF8.GetBytes("file_contents")));

            // SUT
            string actual = await env.Service.UploadParatextCorpusAsync(corpusId, "en", path, CancellationToken.None);
            Assert.AreEqual(fileId, actual);
            Assert.AreEqual(1, handler.NumberOfCalls);
        }

        private class TestEnvironment
        {
            public TestEnvironment(HttpClient httpClient = default)
            {
                FileSystemService = Substitute.For<IFileSystemService>();
                var httpClientFactory = Substitute.For<IHttpClientFactory>();
                httpClientFactory.CreateClient(Arg.Any<string>()).Returns(httpClient);
                var logger = new MockLogger<MachineProjectService>();

                Service = new MachineCorporaService(FileSystemService, httpClientFactory, logger);
            }

            public IFileSystemService FileSystemService { get; }
            public MachineCorporaService Service { get; }
        }
    }
}
