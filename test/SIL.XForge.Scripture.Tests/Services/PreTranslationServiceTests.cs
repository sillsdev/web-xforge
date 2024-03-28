using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using NSubstitute;
using NUnit.Framework;
using Serval.Client;
using SIL.XForge.DataAccess;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Realtime;
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
        env.TranslationEnginesClient.GetAllPretranslationsAsync(
            TranslationEngine01,
            Corpus01,
            textId,
            CancellationToken.None
        )
            .Returns(
                Task.FromResult<IList<Pretranslation>>(
                    [
                        new Pretranslation
                        {
                            TextId = "64_1",
                            Refs = { "64_1:mt1_001" },
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
                            Translation = "To my dear friend Gaius,",
                        },
                        new Pretranslation
                        {
                            TextId = "64_1",
                            Refs = { "64_1:verse_001_001_002" },
                            Translation = "whom I love in the truth:",
                        },
                    ]
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
        Assert.AreEqual("verse_1_1", actual.First().Reference);
        Assert.AreEqual(
            "By the old man, To my dear friend Gaius, whom I love in the truth: ",
            actual.First().Translation
        );
    }

    [Test]
    public async Task GetPreTranslationsAsync_AllowsSegmentedVersesAndHeadingsWhenSendAllSegmentsTrue()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { SendAllSegments = true });
        const int bookNum = 64;
        const int chapterNum = 1;
        string textId = PreTranslationService.GetTextId(bookNum, chapterNum);
        env.TranslationEnginesClient.GetAllPretranslationsAsync(
            TranslationEngine01,
            Corpus01,
            textId,
            CancellationToken.None
        )
            .Returns(
                Task.FromResult<IList<Pretranslation>>(
                    [
                        new Pretranslation
                        {
                            TextId = "64_1",
                            Refs = { "64_1:mt1_001" },
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
                            Translation = "To my dear friend Gaius,",
                        },
                        new Pretranslation
                        {
                            TextId = "64_1",
                            Refs = { "64_1:verse_001_001_002" },
                            Translation = "whom I love in the truth:",
                        },
                    ]
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
        Assert.AreEqual(4, actual.Length);
        Assert.AreEqual("mt1_1", actual[0].Reference);
        Assert.AreEqual("3 John ", actual[0].Translation);
        Assert.AreEqual("verse_1_1", actual[1].Reference);
        Assert.AreEqual("By the old man, ", actual[1].Translation);
        Assert.AreEqual("verse_1_1_1", actual[2].Reference);
        Assert.AreEqual("To my dear friend Gaius, ", actual[2].Translation);
        Assert.AreEqual("verse_1_1_2", actual[3].Reference);
        Assert.AreEqual("whom I love in the truth: ", actual[3].Translation);
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
    public async Task GetPreTranslationsAsync_ReturnsEmptyArrayIfNoPreTranslations_Paratext()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { UseParatextZipFile = true });
        const int bookNum = 40;
        const int chapterNum = 1;
        string textId = PreTranslationService.GetTextId(bookNum);
        env.TranslationEnginesClient.GetAllPretranslationsAsync(
            TranslationEngine01,
            Corpus01,
            textId,
            CancellationToken.None
        )
            .Returns(Task.FromResult<IList<Pretranslation>>([]));

        // SUT
        PreTranslation[] actual = await env.Service.GetPreTranslationsAsync(
            User01,
            Project01,
            bookNum,
            chapterNum,
            CancellationToken.None
        );
        Assert.Zero(actual.Length);
        await env.TranslationEnginesClient.Received()
            .GetAllPretranslationsAsync(TranslationEngine01, Corpus01, textId, CancellationToken.None);
    }

    [Test]
    public async Task GetPreTranslationsAsync_ReturnsEmptyArrayIfNoPreTranslations_Text()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const int bookNum = 40;
        const int chapterNum = 1;
        string textId = PreTranslationService.GetTextId(bookNum, chapterNum);
        env.TranslationEnginesClient.GetAllPretranslationsAsync(
            TranslationEngine01,
            Corpus01,
            textId,
            CancellationToken.None
        )
            .Returns(Task.FromResult<IList<Pretranslation>>([]));

        // SUT
        PreTranslation[] actual = await env.Service.GetPreTranslationsAsync(
            User01,
            Project01,
            bookNum,
            chapterNum,
            CancellationToken.None
        );
        Assert.Zero(actual.Length);
        await env.TranslationEnginesClient.Received()
            .GetAllPretranslationsAsync(TranslationEngine01, Corpus01, textId, CancellationToken.None);
    }

    [Test]
    public async Task GetPreTranslationsAsync_ReturnsUsablePreTranslations_Paratext()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { UseParatextZipFile = true });
        const int bookNum = 40;
        const int chapterNum = 1;
        string textId = PreTranslationService.GetTextId(bookNum);
        env.TranslationEnginesClient.GetAllPretranslationsAsync(
            TranslationEngine01,
            Corpus01,
            textId,
            CancellationToken.None
        )
            .Returns(
                Task.FromResult<IList<Pretranslation>>(
                    [
                        new Pretranslation { TextId = "40_1", Translation = "Matthew" },
                        new Pretranslation
                        {
                            TextId = "MAT",
                            Refs = { "MAT 1:1" },
                            Translation =
                                "The book of the birth of Jesus Christ , the son of David , the son of Abraham .",
                        },
                        new Pretranslation
                        {
                            TextId = "MAT",
                            Refs = { "MAT 1:2" },
                            Translation =
                                "Abraham was the father of Isaac , Isaac was the father of James , and James was the father of Jude and his brethren .",
                        },
                        new Pretranslation
                        {
                            TextId = "MAT",
                            Refs = { "MAT 2:1" },
                            Translation =
                                "This will not be returned - Serval returns all of the book's pre-translations",
                        },
                        new Pretranslation
                        {
                            TextId = "MAT",
                            Refs = { "invalid_ref" },
                            Translation = "This will not be returned as it has an invalid ref",
                        },
                    ]
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
        Assert.AreEqual("verse_1_1", actual.First().Reference);
        Assert.AreEqual(
            "The book of the birth of Jesus Christ, the son of David, the son of Abraham. ",
            actual.First().Translation
        );
        Assert.AreEqual("verse_1_2", actual.Last().Reference);
        Assert.AreEqual(
            "Abraham was the father of Isaac, Isaac was the father of James, and James was the father of Jude and his brethren. ",
            actual.Last().Translation
        );
    }

    [Test]
    public async Task GetPreTranslationsAsync_ReturnsUsablePreTranslations_Text()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const int bookNum = 40;
        const int chapterNum = 1;
        string textId = PreTranslationService.GetTextId(bookNum, chapterNum);
        env.TranslationEnginesClient.GetAllPretranslationsAsync(
            TranslationEngine01,
            Corpus01,
            textId,
            CancellationToken.None
        )
            .Returns(
                Task.FromResult<IList<Pretranslation>>(
                    [
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
                        new Pretranslation
                        {
                            TextId = "40_1",
                            Refs = { "invalid_ref" },
                            Translation = "This ref does not have a colon, so is invalid and will not be returned",
                        },
                        new Pretranslation
                        {
                            TextId = "40_1",
                            Refs = { "41_1:verse_001_002" },
                            Translation = "This ref is for the wrong book, so will not be returned",
                        },
                        new Pretranslation
                        {
                            TextId = "40_1",
                            Refs = { "40_1:verse_001" },
                            Translation = "This ref has only a chapter number, so will not be returned",
                        },
                        new Pretranslation
                        {
                            TextId = "40_1",
                            Refs = { "40_1:verse_001:001" },
                            Translation = "This ref has too many colons, so will not be returned",
                        },
                    ]
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
        Assert.AreEqual("verse_1_1", actual.First().Reference);
        Assert.AreEqual(
            "The book of the birth of Jesus Christ, the son of David, the son of Abraham. ",
            actual.First().Translation
        );
        Assert.AreEqual("verse_1_2", actual.Last().Reference);
        Assert.AreEqual(
            "Abraham was the father of Isaac, Isaac was the father of James, and James was the father of Jude and his brethren. ",
            actual.Last().Translation
        );
    }

    [Test]
    public void GetPreTranslationUsfmAsync_ThrowsExceptionWhenProjectSecretMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.GetPreTranslationUsfmAsync(User01, "invalid_project_id", 40, 1, CancellationToken.None)
        );
    }

    [Test]
    public void GetPreTranslationUsfmAsync_ThrowsExceptionWhenNoPreTranslationConfigured()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.GetPreTranslationUsfmAsync(User01, Project02, 40, 1, CancellationToken.None)
        );
    }

    [Test]
    public async Task GetPreTranslationUsfmAsync_ReturnsEntireBook()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { UseParatextZipFile = true });

        // SUT
        string usfm = await env.Service.GetPreTranslationUsfmAsync(User01, Project01, 40, 0, CancellationToken.None);
        Assert.AreEqual(TestEnvironment.MatthewBookUsfm, usfm);
    }

    [Test]
    public async Task GetPreTranslationUsfmAsync_ReturnsChapterOneWithIntroductoryMaterial()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { UseParatextZipFile = true });

        // SUT
        string usfm = await env.Service.GetPreTranslationUsfmAsync(User01, Project01, 40, 1, CancellationToken.None);
        Assert.AreEqual(TestEnvironment.MatthewChapterOneUsfm, usfm);
    }

    [Test]
    public async Task GetPreTranslationUsfmAsync_ReturnsSpecificChapter()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { UseParatextZipFile = true });

        // SUT
        string usfm = await env.Service.GetPreTranslationUsfmAsync(User01, Project01, 40, 2, CancellationToken.None);
        Assert.AreEqual(TestEnvironment.MatthewChapterTwoUsfm, usfm);
    }

    [Test]
    public async Task GetPreTranslationUsfmAsync_ReturnsEmptyStringForMissingChapter()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { UseParatextZipFile = true });

        // SUT
        string usfm = await env.Service.GetPreTranslationUsfmAsync(User01, Project01, 40, 3, CancellationToken.None);
        Assert.IsEmpty(usfm);
    }

    private class TestEnvironmentOptions
    {
        public bool SendAllSegments { get; init; }
        public bool UseParatextZipFile { get; init; }
    }

    private class TestEnvironment
    {
        public const string MatthewChapterOneUsfm =
            "\\id MAT - ProjectNameHere\n" + "\\c 1\n" + "\\v 1 Verse 1:1 here.\n" + "\\v 2 Verse 1:2 here.\n";
        public const string MatthewChapterTwoUsfm = "\\c 2\n" + "\\v 1 Verse 2:1 here.\n";
        public const string MatthewBookUsfm = MatthewChapterOneUsfm + MatthewChapterTwoUsfm;

        public TestEnvironment(TestEnvironmentOptions? options = null)
        {
            options ??= new TestEnvironmentOptions();
            var projectSecrets = new MemoryRepository<SFProjectSecret>(
                [
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
                                    new ServalCorpus { PreTranslate = false }
                                },
                                {
                                    Corpus01,
                                    new ServalCorpus
                                    {
                                        PreTranslate = true,
                                        UploadParatextZipFile = options.UseParatextZipFile,
                                    }
                                },
                            },
                        },
                    },
                    new SFProjectSecret { Id = Project02 },
                ]
            );
            var realtimeService = new SFMemoryRealtimeService();
            SFProject[] sfProjects =
            [
                new SFProject
                {
                    Id = Project01,
                    TranslateConfig = new TranslateConfig
                    {
                        DraftConfig = { SendAllSegments = options.SendAllSegments },
                    },
                },
            ];
            realtimeService.AddRepository("sf_projects", OTType.Json0, new MemoryRepository<SFProject>(sfProjects));
            TranslationEnginesClient = Substitute.For<ITranslationEnginesClient>();
            TranslationEnginesClient
                .GetPretranslatedUsfmAsync(Arg.Any<string>(), Arg.Any<string>(), "MAT", CancellationToken.None)
                .Returns(MatthewBookUsfm);
            Service = new PreTranslationService(projectSecrets, realtimeService, TranslationEnginesClient);
        }

        public PreTranslationService Service { get; }
        public ITranslationEnginesClient TranslationEnginesClient { get; }
    }
}
