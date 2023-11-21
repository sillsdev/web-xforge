using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using NSubstitute;
using NUnit.Framework;
using Serval.Client;
using SIL.XForge.DataAccess;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class PreTranslationServiceTests
{
    private const string Project01 = "project01";
    private const string Project02 = "project02";
    private const string User01 = "user01";
    private const string Corpus01 = "corpus01";
    private const string TranslationEngine01 = "translationEngine01";

    [Test]
    public async Task GetPreTranslationsAsync_CombinesSegmentedVerses()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const int bookNum = 64;
        const int chapterNum = 1;
        string textId = PreTranslationService.GetTextId(bookNum, chapterNum);
        env.TranslationEnginesClient
            .GetAllPretranslationsAsync(TranslationEngine01, Corpus01, textId, CancellationToken.None)
            .Returns(
                Task.FromResult<IList<Pretranslation>>(
                    new List<Pretranslation>
                    {
                        new Pretranslation
                        {
                            TextId = "64_1",
                            Refs = { "64_1:h_001" },
                            Translation = "3 John",
                        },
                        new Pretranslation
                        {
                            TextId = "64_1",
                            Refs = { "64_1:verse_001_001" },
                            Translation = "By the old man,",
                        },
                        new Pretranslation
                        {
                            TextId = "64_1",
                            Refs = { "64_1:verse_001_001_001" },
                            Translation = "To my dear friend Gaius, whom I love in the truth:",
                        },
                    }
                )
            );

        // SUT
        PreTranslation[] actual = await env.Service.GetPreTranslationsAsync(
            User01,
            Project01,
            bookNum,
            chapterNum,
            CancellationToken.None
        );
        Assert.AreEqual(1, actual.Length);
        Assert.AreEqual("3JN 1:1", actual.First().Reference);
        Assert.AreEqual(
            "By the old man, To my dear friend Gaius, whom I love in the truth:",
            actual.First().Translation
        );
    }

    [Test]
    public void GetPreTranslationsAsync_ThrowsExceptionWhenProjectSecretMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.GetPreTranslationsAsync(User01, "invalid_project_id", 40, 1, CancellationToken.None)
        );
    }

    [Test]
    public void GetPreTranslationsAsync_ThrowsExceptionWhenNoPreTranslationConfigured()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.GetPreTranslationsAsync(User01, Project02, 40, 1, CancellationToken.None)
        );
    }

    [Test]
    public async Task GetPreTranslationsAsync_ReturnsEmptyArrayIfNoPreTranslations()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const int bookNum = 40;
        const int chapterNum = 1;
        string textId = PreTranslationService.GetTextId(bookNum, chapterNum);
        env.TranslationEnginesClient
            .GetAllPretranslationsAsync(TranslationEngine01, Corpus01, textId, CancellationToken.None)
            .Returns(Task.FromResult<IList<Pretranslation>>(new List<Pretranslation>()));

        // SUT
        PreTranslation[] actual = await env.Service.GetPreTranslationsAsync(
            User01,
            Project01,
            bookNum,
            chapterNum,
            CancellationToken.None
        );
        Assert.Zero(actual.Length);
    }

    [Test]
    public async Task GetPreTranslationsAsync_ReturnsUsablePreTranslations()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const int bookNum = 40;
        const int chapterNum = 1;
        string textId = PreTranslationService.GetTextId(bookNum, chapterNum);
        env.TranslationEnginesClient
            .GetAllPretranslationsAsync(TranslationEngine01, Corpus01, textId, CancellationToken.None)
            .Returns(
                Task.FromResult<IList<Pretranslation>>(
                    new List<Pretranslation>
                    {
                        new Pretranslation { TextId = "40_1", Translation = "Matthew" },
                        new Pretranslation
                        {
                            TextId = "40_1",
                            Refs = { "40_1:verse_001_001" },
                            Translation =
                                "The book of the birth of Jesus Christ , the son of David , the son of Abraham .",
                        },
                        new Pretranslation
                        {
                            TextId = "40_1",
                            Refs = { "40_1:verse_001_002" },
                            Translation =
                                "Abraham was the father of Isaac , Isaac was the father of James , and James was the father of Jude and his brethren .",
                        },
                    }
                )
            );

        // SUT
        PreTranslation[] actual = await env.Service.GetPreTranslationsAsync(
            User01,
            Project01,
            bookNum,
            chapterNum,
            CancellationToken.None
        );
        Assert.AreEqual(2, actual.Length);
        Assert.AreEqual("MAT 1:1", actual.First().Reference);
        Assert.AreEqual(
            "The book of the birth of Jesus Christ, the son of David, the son of Abraham.",
            actual.First().Translation
        );
        Assert.AreEqual("MAT 1:2", actual.Last().Reference);
        Assert.AreEqual(
            "Abraham was the father of Isaac, Isaac was the father of James, and James was the father of Jude and his brethren.",
            actual.Last().Translation
        );
    }

    private class TestEnvironment
    {
        public TestEnvironment()
        {
            var projectSecrets = new MemoryRepository<SFProjectSecret>(
                new[]
                {
                    new SFProjectSecret
                    {
                        Id = Project01,
                        ServalData = new ServalData
                        {
                            PreTranslationEngineId = TranslationEngine01,
                            Corpora = new Dictionary<string, ServalCorpus>
                            {
                                {
                                    "another_corpus",
                                    new ServalCorpus { PreTranslate = false, }
                                },
                                {
                                    Corpus01,
                                    new ServalCorpus { PreTranslate = true, }
                                },
                            },
                        },
                    },
                    new SFProjectSecret { Id = Project02 },
                }
            );
            TranslationEnginesClient = Substitute.For<ITranslationEnginesClient>();
            Service = new PreTranslationService(projectSecrets, TranslationEnginesClient);
        }

        public PreTranslationService Service { get; }
        public ITranslationEnginesClient TranslationEnginesClient { get; }
    }
}
