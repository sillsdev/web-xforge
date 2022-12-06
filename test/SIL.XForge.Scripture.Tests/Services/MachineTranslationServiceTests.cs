using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using NSubstitute;
using NUnit.Framework;
using SIL.Machine.WebApi;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services
{
    [TestFixture]
    public class MachineTranslationServiceTests
    {
        private const string TranslationEngine01 = "translationEngine01";

        [Test]
        public async Task CreateTranslationEngineAsync_Success()
        {
            // Set up a mock Machine API
            string response =
                $"{{\"id\": \"{TranslationEngine01}\",\"href\":\"/translation-engines/{TranslationEngine01}\"}}";
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.OK);
            var httpClient = TestEnvironment.CreateHttpClient(handler);

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            string actual = await env.Service.CreateTranslationEngineAsync("name", "en", "en", CancellationToken.None);

            Assert.AreEqual(TranslationEngine01, actual);
            Assert.AreEqual(1, handler.NumberOfCalls);
        }

        [Test]
        public void DeleteTranslationEngineAsync_NoPermission()
        {
            // Set up a mock Machine API
            string response = string.Empty;
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.Forbidden);
            var httpClient = TestEnvironment.CreateHttpClient(handler);

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            Assert.ThrowsAsync<HttpRequestException>(
                () => env.Service.DeleteTranslationEngineAsync(TranslationEngine01, CancellationToken.None)
            );
        }

        [Test]
        public async Task DeleteTranslationEngineAsync_Success()
        {
            // Set up a mock Machine API
            string response = string.Empty;
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.OK);
            var httpClient = TestEnvironment.CreateHttpClient(handler);

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            await env.Service.DeleteTranslationEngineAsync(TranslationEngine01, CancellationToken.None);
        }

        [Test]
        public void GetTranslationEngineAsync_NoPermission()
        {
            // Set up a mock Machine API
            string response = string.Empty;
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.Forbidden);
            var httpClient = TestEnvironment.CreateHttpClient(handler);

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            Assert.ThrowsAsync<HttpRequestException>(
                () => env.Service.GetTranslationEngineAsync(TranslationEngine01, CancellationToken.None)
            );
        }

        [Test]
        public async Task GetTranslationEngineAsync_Success()
        {
            // Set up a mock Machine API
            string name = "my_translation_engine";
            string sourceLanguageTag = "en_US";
            string targetLanguageTag = "en_NZ";
            string type = "SmtTransfer";
            int modelRevision = 1;
            int confidence = 100;
            int corpusSize = 472;
            string response =
                $@"{{
                ""name"": ""{name}"",
                ""sourceLanguageTag"": ""{sourceLanguageTag}"",
                ""targetLanguageTag"": ""{targetLanguageTag}"",
                ""type"": ""{type}"",
                ""isBuilding"": true,
                ""modelRevision"": {modelRevision},
                ""confidence"": {confidence},
                ""corpusSize"": {corpusSize},
                ""id"": ""{TranslationEngine01}"",
                ""href"": ""/translation-engines/{TranslationEngine01}""
            }}";
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.OK);
            var httpClient = TestEnvironment.CreateHttpClient(handler);

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            MachineApiTranslationEngine actual = await env.Service.GetTranslationEngineAsync(
                TranslationEngine01,
                CancellationToken.None
            );

            Assert.AreEqual(1, handler.NumberOfCalls);
            Assert.AreEqual(TranslationEngine01, actual.Id);
            Assert.AreEqual(name, actual.Name);
            Assert.AreEqual(sourceLanguageTag, actual.SourceLanguageTag);
            Assert.AreEqual(targetLanguageTag, actual.TargetLanguageTag);
            Assert.AreEqual(type, actual.Type);
            Assert.IsTrue(actual.IsBuilding);
            Assert.AreEqual(modelRevision, actual.ModelRevision);
            Assert.AreEqual(confidence, actual.Confidence);
            Assert.AreEqual(corpusSize, actual.CorpusSize);
        }

        [Test]
        public async Task GetWordGraphAsync_Success()
        {
            // Set up a mock Machine API
            var segment = new[] { "Test", "Data" };
            string response =
                $@"{{
                    ""initialStateScore"": -91.43696,
                    ""finalStates"": [
                    2
                    ],
                    ""arcs"": [
                    {{
                      ""prevState"": 0,
                      ""nextState"": 1,
                      ""score"": -9.8753,
                      ""words"": [
                        ""{segment.First().ToLower()}""
                      ],
                      ""confidences"": [
                        0.9980028
                      ],
                      ""sourceSegmentRange"": {{
                        ""start"": 0,
                        ""end"": 1
                      }},
                      ""alignment"": [
                        {{
                          ""sourceIndex"": 0,
                          ""targetIndex"": 0
                        }}
                      ],
                      ""sources"": [
                        ""Smt""
                      ]
                    }},
                    {{
                      ""prevState"": 1,
                      ""nextState"": 2,
                      ""score"": 41.6542,
                      ""words"": [
                        ""{segment.Last().ToLower()}""
                      ],
                      ""confidences"": [
                        0.0012210013
                      ],
                      ""sourceSegmentRange"": {{
                        ""start"": 1,
                        ""end"": 2
                      }},
                      ""alignment"": [
                        {{
                          ""sourceIndex"": 0,
                          ""targetIndex"": 0
                        }}
                      ],
                      ""sources"": [
                        ""None""
                      ]
                    }}
                    ]
                }}";
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.OK);
            var httpClient = TestEnvironment.CreateHttpClient(handler);

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            WordGraphDto actual = await env.Service.GetWordGraphAsync(
                TranslationEngine01,
                segment,
                CancellationToken.None
            );

            Assert.AreEqual(1, handler.NumberOfCalls);
            Assert.AreEqual(segment.Length, actual.Arcs.Length);
            Assert.AreEqual(segment.First().ToLower(), actual.Arcs.First().Words.First().ToLower());
            Assert.AreEqual(segment.Last().ToLower(), actual.Arcs.Last().Words.First().ToLower());
        }

        [Test]
        public void GetWordGraphAsync_NoPermission()
        {
            // Set up a mock Machine API
            string response = string.Empty;
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.Forbidden);
            var httpClient = TestEnvironment.CreateHttpClient(handler);

            // Set up test environment
            var env = new TestEnvironment(httpClient);
            var segment = new[] { "Test", "Data" };

            // SUT
            Assert.ThrowsAsync<HttpRequestException>(
                () => env.Service.GetWordGraphAsync(TranslationEngine01, segment, CancellationToken.None)
            );
        }

        [Test]
        public void GetWordGraphAsync_InvalidId()
        {
            // Set up test environment
            var env = new TestEnvironment();
            var translationEngineId = "../../An-Injection-Attack?this=is~invalid!!";
            var segment = new[] { "Test", "Data" };

            // SUT
            Assert.ThrowsAsync<ArgumentException>(
                () => env.Service.GetWordGraphAsync(translationEngineId, segment, CancellationToken.None)
            );
        }

        [Test]
        public async Task TrainSegmentAsync_Success()
        {
            // Set up a mock Machine API
            string response = string.Empty;
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.OK);
            var httpClient = TestEnvironment.CreateHttpClient(handler);

            // Set up test environment
            var env = new TestEnvironment(httpClient);
            var segmentPairDto = new SegmentPairDto
            {
                SentenceStart = true,
                SourceSegment = new[] { "Test", "Data" },
                TargetSegment = new[] { "Test", "Data" },
            };

            // SUT
            await env.Service.TrainSegmentAsync(TranslationEngine01, segmentPairDto, CancellationToken.None);

            Assert.AreEqual(1, handler.NumberOfCalls);
        }

        [Test]
        public void TrainSegmentAsync_NoPermission()
        {
            // Set up a mock Machine API
            string response = string.Empty;
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.Forbidden);
            var httpClient = TestEnvironment.CreateHttpClient(handler);

            // Set up test environment
            var env = new TestEnvironment(httpClient);
            var segmentPairDto = new SegmentPairDto
            {
                SentenceStart = true,
                SourceSegment = new[] { "Test", "Data" },
                TargetSegment = new[] { "Test", "Data" },
            };

            // SUT
            Assert.ThrowsAsync<HttpRequestException>(
                () => env.Service.TrainSegmentAsync(TranslationEngine01, segmentPairDto, CancellationToken.None)
            );
        }

        [Test]
        public async Task TranslateAsync_Success()
        {
            // Set up a mock Machine API
            var segment = new[] { "Test", "Data" };
            string response =
                $@"{{
                    ""target"": [
                      ""{segment.First()}"",
                      ""{segment.Last()}""
                    ],
                    ""confidences"": [
                      0.97835666,
                      0.9998312
                    ],
                    ""sources"": [
                      ""Smt"",
                      ""Smt""
                    ],
                    ""alignment"": [
                    {{
                      ""sourceIndex"": 0,
                      ""targetIndex"": 0
                    }},
                    {{
                      ""sourceIndex"": 1,
                      ""targetIndex"": 1
                    }}
                    ],
                    ""phrases"": [
                    {{
                      ""sourceSegmentRange"": {{
                        ""start"": 0,
                        ""end"": 2
                      }},
                      ""targetSegmentCut"": 2,
                      ""confidence"": 0.9783566679198871
                    }}
                    ]
                }}";
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.OK);
            var httpClient = TestEnvironment.CreateHttpClient(handler);

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            TranslationResultDto actual = await env.Service.TranslateAsync(
                TranslationEngine01,
                segment,
                CancellationToken.None
            );

            Assert.AreEqual(1, handler.NumberOfCalls);
            Assert.AreEqual(segment.Length, actual.Target.Length);
            Assert.AreEqual(segment.First(), actual.Target.First());
            Assert.AreEqual(segment.Last(), actual.Target.Last());
        }

        [Test]
        public void TranslateAsync_NoPermission()
        {
            // Set up a mock Machine API
            string response = string.Empty;
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.Forbidden);
            var httpClient = TestEnvironment.CreateHttpClient(handler);

            // Set up test environment
            var env = new TestEnvironment(httpClient);
            var segment = new[] { "Test", "Data" };

            // SUT
            Assert.ThrowsAsync<HttpRequestException>(
                () => env.Service.TranslateAsync(TranslationEngine01, segment, CancellationToken.None)
            );
        }

        [Test]
        public async Task TranslateNAsync_Success()
        {
            // Set up a mock Machine API
            var segment = new[] { "Test", "Data" };
            string response =
                $@"[
                    {{
                      ""target"": [
                        ""{segment.First()}"",
                        ""{segment.Last()}""
                      ],
                      ""confidences"": [
                        0.97835666,
                        0.9998312
                      ],
                      ""sources"": [
                        ""Smt"",
                        ""Smt""
                      ],
                      ""alignment"": [
                        {{
                          ""sourceIndex"": 0,
                          ""targetIndex"": 0
                        }},
                        {{
                          ""sourceIndex"": 1,
                          ""targetIndex"": 1
                        }}
                      ],
                      ""phrases"": [
                        {{
                          ""sourceSegmentRange"": {{
                            ""start"": 0,
                            ""end"": 2
                          }},
                          ""targetSegmentCut"": 2,
                          ""confidence"": 0.9783566679198871
                        }}
                      ]
                    }}
                ]";
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.OK);
            var httpClient = TestEnvironment.CreateHttpClient(handler);

            // Set up test environment
            var env = new TestEnvironment(httpClient);

            // SUT
            TranslationResultDto[] actual = await env.Service.TranslateNAsync(
                TranslationEngine01,
                n: 2,
                segment,
                CancellationToken.None
            );

            Assert.AreEqual(1, handler.NumberOfCalls);
            Assert.AreEqual(segment.Length, actual.First().Target.Length);
            Assert.AreEqual(segment.First(), actual.First().Target.First());
            Assert.AreEqual(segment.Last(), actual.First().Target.Last());
        }

        [Test]
        public void TranslateNAsync_NoPermission()
        {
            // Set up a mock Machine API
            string response = string.Empty;
            var handler = new MockHttpMessageHandler(response, HttpStatusCode.Forbidden);
            var httpClient = TestEnvironment.CreateHttpClient(handler);

            // Set up test environment
            var env = new TestEnvironment(httpClient);
            var segment = new[] { "Test", "Data" };

            // SUT
            Assert.ThrowsAsync<HttpRequestException>(
                () => env.Service.TranslateNAsync(TranslationEngine01, n: 2, segment, CancellationToken.None)
            );
        }

        private class TestEnvironment
        {
            public TestEnvironment(HttpClient? httpClient = default)
            {
                var exceptionHandler = new MockExceptionHandler();
                var httpClientFactory = Substitute.For<IHttpClientFactory>();
                httpClientFactory.CreateClient(Arg.Any<string>()).Returns(httpClient);

                Service = new MachineTranslationService(exceptionHandler, httpClientFactory);
            }

            public MachineTranslationService Service { get; }

            public static HttpClient CreateHttpClient(HttpMessageHandler handler) =>
                new HttpClient(handler) { BaseAddress = new Uri("http://localhost") };
        }
    }
}
