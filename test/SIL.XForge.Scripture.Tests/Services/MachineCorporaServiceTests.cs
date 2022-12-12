using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services
{
    [TestFixture]
    public class MachineCorporaServiceTests
    {
        private const string Project01 = "project01";

        [Test]
        public void AddCorpusToTranslationEngineAsync_Invalid()
        {
            // Set up a mock Machine API
            string translationEngineId = "63372e670935fe633f927c85";
            string corpusId = "633fdb281a2e7ac760f7193a";
            string response = "{}";
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.OK);
            var httpClient = TestEnvironment.CreateHttpClient(handler);

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            Assert.ThrowsAsync<HttpRequestException>(
                () =>
                    env.Service.AddCorpusToTranslationEngineAsync(
                        translationEngineId,
                        corpusId,
                        false,
                        CancellationToken.None
                    )
            );
        }

        [Test]
        public async Task AddCorpusToTranslationEngineAsync_Success()
        {
            // Set up a mock Machine API
            string translationEngineId = "63372e670935fe633f927c85";
            string corpusId = "633fdb281a2e7ac760f7193a";
            string response =
                @$"{{
                  ""href"": ""/translation-engines/{translationEngineId}/corpora/{corpusId}"",
                  ""corpus"": {{
                    ""id"": ""{corpusId}"",
                    ""href"": ""/corpora/{corpusId}""
                  }},
                  ""pretranslate"": false
                }}";
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.OK);
            var httpClient = TestEnvironment.CreateHttpClient(handler);

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            await env.Service.AddCorpusToTranslationEngineAsync(
                translationEngineId,
                corpusId,
                false,
                CancellationToken.None
            );
            Assert.AreEqual(1, handler.NumberOfCalls);
        }

        [Test]
        public async Task CreateCorpusAsync_Success()
        {
            // Set up a mock Machine API
            string corpusId = "633fdb281a2e7ac760f7193a";
            string response = $"{{\"id\": \"{corpusId}\",\"href\":\"/corpora/{corpusId}\"}}";
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.OK);
            var httpClient = TestEnvironment.CreateHttpClient(handler);

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            string actual = await env.Service.CreateCorpusAsync(Project01, false, CancellationToken.None);
            Assert.AreEqual(corpusId, actual);
            Assert.AreEqual(1, handler.NumberOfCalls);
        }

        [Test]
        public void DeleteCorpusAsync_NoPermission()
        {
            // Set up a mock Machine API
            string corpusId = "633fdb281a2e7ac760f7193a";
            string response = string.Empty;
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.Forbidden);
            var httpClient = TestEnvironment.CreateHttpClient(handler);

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            Assert.ThrowsAsync<HttpRequestException>(
                () => env.Service.DeleteCorpusAsync(corpusId, CancellationToken.None)
            );
        }

        [Test]
        public async Task DeleteCorpusAsync_Success()
        {
            // Set up a mock Machine API
            string corpusId = "633fdb281a2e7ac760f7193a";
            string response = string.Empty;
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.OK);
            var httpClient = TestEnvironment.CreateHttpClient(handler);

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            await env.Service.DeleteCorpusAsync(corpusId, CancellationToken.None);
        }

        [Test]
        public void DeleteCorpusFileAsync_NoPermission()
        {
            // Set up a mock Machine API
            string corpusId = "633fdb281a2e7ac760f7193a";
            string fileId = "634089bd1706669dc1acf6a4";
            string response = string.Empty;
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.Forbidden);
            var httpClient = TestEnvironment.CreateHttpClient(handler);

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            Assert.ThrowsAsync<HttpRequestException>(
                () => env.Service.DeleteCorpusFileAsync(corpusId, fileId, CancellationToken.None)
            );
        }

        [Test]
        public async Task DeleteCorpusFileAsync_Success()
        {
            // Set up a mock Machine API
            string corpusId = "633fdb281a2e7ac760f7193a";
            string fileId = "634089bd1706669dc1acf6a4";
            string response = string.Empty;
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.OK);
            var httpClient = TestEnvironment.CreateHttpClient(handler);

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            await env.Service.DeleteCorpusFileAsync(corpusId, fileId, CancellationToken.None);
        }

        [Test]
        public async Task GetCorpusFilesAsync_Success()
        {
            // Set up a mock Machine API
            string fileId = "634089bd1706669dc1acf6a4";
            string corpusId = "633fdb281a2e7ac760f7193a";
            string href = $"/corpora/{corpusId}/files/{fileId}";
            string languageTag = "en";
            string name = "test.txt";
            string textId = "test1";
            string response =
                @$"[
                    {{
                        ""languageTag"": ""{languageTag}"",
                        ""name"": ""{name}"",
                        ""textId"": ""{textId}"",
                        ""id"": ""{fileId}"",
                        ""href"": ""{href}""
                    }}
                ]";
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.OK);
            var httpClient = TestEnvironment.CreateHttpClient(handler);

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            List<MachineApiCorpusFile> actual = (
                await env.Service.GetCorpusFilesAsync(corpusId, CancellationToken.None)
            ).ToList();
            Assert.AreEqual(1, actual.Count);
            Assert.AreEqual(fileId, actual.First().Id);
            Assert.AreEqual(href, actual.First().Href);
            Assert.AreEqual(languageTag, actual.First().LanguageTag);
            Assert.AreEqual(name, actual.First().Name);
            Assert.AreEqual(textId, actual.First().TextId);
            Assert.IsNull(actual.First().Corpus);
            Assert.AreEqual(1, handler.NumberOfCalls);
        }

        [Test]
        public async Task GetCorpusFilesAsync_NoFiles()
        {
            // Set up a mock Machine API
            string corpusId = "633fdb281a2e7ac760f7193a";
            string response = "[]";
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.OK);
            var httpClient = TestEnvironment.CreateHttpClient(handler);

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            IEnumerable<MachineApiCorpusFile> actual = await env.Service.GetCorpusFilesAsync(
                corpusId,
                CancellationToken.None
            );
            Assert.Zero(actual.Count());
        }

        [Test]
        public void RemoveCorpusFromTranslationEngineAsync_NoPermission()
        {
            // Set up a mock Machine API
            string translationEngineId = "63372e670935fe633f927c85";
            string corpusId = "633fdb281a2e7ac760f7193a";
            string response = string.Empty;
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.Forbidden);
            var httpClient = TestEnvironment.CreateHttpClient(handler);

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            Assert.ThrowsAsync<HttpRequestException>(
                () =>
                    env.Service.RemoveCorpusFromTranslationEngineAsync(
                        translationEngineId,
                        corpusId,
                        CancellationToken.None
                    )
            );
        }

        [Test]
        public async Task RemoveCorpusFromTranslationEngineAsync_Success()
        {
            // Set up a mock Machine API
            string translationEngineId = "63372e670935fe633f927c85";
            string corpusId = "633fdb281a2e7ac760f7193a";
            string response = string.Empty;
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.OK);
            var httpClient = TestEnvironment.CreateHttpClient(handler);

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            await env.Service.RemoveCorpusFromTranslationEngineAsync(
                translationEngineId,
                corpusId,
                CancellationToken.None
            );
        }

        [Test]
        public async Task UploadCorpusTextAsync_Success()
        {
            // Set up a mock Machine API
            string fileId = "634089bd1706669dc1acf6a4";
            string corpusId = "633fdb281a2e7ac760f7193a";
            string languageTag = "en";
            string textId = "test1";
            string name = "my_project";
            string response =
                @$"{{
                    ""id"": ""{fileId}"",
                    ""href"": ""/corpora/{corpusId}/files/{fileId}"",
                    ""corpus"": {{
                        ""id"": ""{corpusId}"",
                        ""href"": ""/corpora/{corpusId}""
                    }},
                    ""languageTag"": ""{languageTag}"",
                    ""name"": ""{name}"",
                    ""textId"": ""{textId}""
                }}";
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.OK);
            var httpClient = TestEnvironment.CreateHttpClient(handler);

            // Set up test environment
            var env = new TestEnvironment(httpClient);
            string text = "1-1\tLine 1\r\n1-2\tLine 2\tsr";

            // SUT
            string actual = await env.Service.UploadCorpusTextAsync(
                corpusId,
                languageTag,
                textId,
                text,
                CancellationToken.None
            );
            Assert.AreEqual(fileId, actual);
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
            string languageTag = "en";
            string name = "my_project";
            string response =
                @$"{{
                    ""id"": ""{fileId}"",
                    ""href"": ""/corpora/{corpusId}/files/{fileId}"",
                    ""corpus"": {{
                        ""id"": ""{corpusId}"",
                        ""href"": ""/corpora/{corpusId}""
                    }},
                    ""languageTag"": ""{languageTag}"",
                    ""name"": ""{name}""
                }}";
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.OK);
            var httpClient = TestEnvironment.CreateHttpClient(handler);

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
            string actual = await env.Service.UploadParatextCorpusAsync(
                corpusId,
                languageTag,
                path,
                CancellationToken.None
            );
            Assert.AreEqual(fileId, actual);
            Assert.AreEqual(1, handler.NumberOfCalls);
        }

        private class TestEnvironment
        {
            public TestEnvironment(HttpClient? httpClient = default)
            {
                var exceptionHandler = new MockExceptionHandler();
                FileSystemService = Substitute.For<IFileSystemService>();
                var httpClientFactory = Substitute.For<IHttpClientFactory>();
                httpClientFactory.CreateClient(Arg.Any<string>()).Returns(httpClient);

                Service = new MachineCorporaService(exceptionHandler, FileSystemService, httpClientFactory);
            }

            public IFileSystemService FileSystemService { get; }
            public MachineCorporaService Service { get; }

            public static HttpClient CreateHttpClient(HttpMessageHandler handler) =>
                new HttpClient(handler) { BaseAddress = new Uri("http://localhost") };
        }
    }
}
