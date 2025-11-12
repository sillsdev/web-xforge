using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using NSubstitute;
using NSubstitute.Extensions;
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
    private const string Corpus01 = "corpus01";
    private const string ParallelCorpus01 = "parallelCorpus01";
    private const string TranslationEngine01 = "translationEngine01";

    [TestCase(true)]
    [TestCase(false)]
    public async Task GetPreTranslationParametersAsync_CompatibleWithLegacyCorpora(bool uploadParatextZipFile)
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.SetupProjectSecretAsync(
            new ServalData
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
                        new ServalCorpus { PreTranslate = true, UploadParatextZipFile = uploadParatextZipFile }
                    },
                },
            }
        );

        // SUT
        (string translationEngineId, string corpusId, string parallelCorpusId, bool useParatextVerseRef) =
            await env.Service.GetPreTranslationParametersAsync(Project01);
        Assert.AreEqual(TranslationEngine01, translationEngineId);
        Assert.AreEqual(Corpus01, corpusId);
        Assert.IsNull(parallelCorpusId);
        Assert.AreEqual(uploadParatextZipFile, useParatextVerseRef);
    }

    [Test]
    public async Task GetPreTranslationParametersAsync_CompatibleWithParallelCorpora()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.SetupProjectSecretAsync(
            new ServalData
            {
                ParallelCorpusIdForPreTranslate = ParallelCorpus01,
                PreTranslationEngineId = TranslationEngine01,
            }
        );

        // SUT
        (string translationEngineId, string corpusId, string parallelCorpusId, bool useParatextVerseRef) =
            await env.Service.GetPreTranslationParametersAsync(Project01);
        Assert.AreEqual(TranslationEngine01, translationEngineId);
        Assert.IsNull(corpusId);
        Assert.AreEqual(ParallelCorpus01, parallelCorpusId);
        Assert.IsTrue(useParatextVerseRef);
    }

    [Test]
    public async Task GetPreTranslationParametersAsync_ThrowsExceptionWhenNoCorpusConfiguredForProject()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.SetupProjectSecretAsync(new ServalData { PreTranslationEngineId = TranslationEngine01 });

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() => env.Service.GetPreTranslationParametersAsync(Project01));
    }

    [Test]
    public async Task GetPreTranslationParametersAsync_ThrowsExceptionWhenNoPreTranslationConfigured()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.SetupProjectSecretAsync(new ServalData());

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() => env.Service.GetPreTranslationParametersAsync(Project01));
    }

    [Test]
    public async Task GetPreTranslationParametersAsync_ThrowsExceptionWhenNullServalData()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.SetupProjectSecretAsync(servalData: null);

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() => env.Service.GetPreTranslationParametersAsync(Project01));
    }

    [Test]
    public void GetPreTranslationParametersAsync_ThrowsExceptionWhenProjectSecretMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.GetPreTranslationParametersAsync("invalid_project_id")
        );
    }

    [Test]
    public async Task GetPreTranslationsAsync_CombinesSegmentedVerses()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { MockPreTranslationParameters = true });
        const int bookNum = 64;
        const int chapterNum = 1;
        string textId = PreTranslationService.GetTextId(bookNum, chapterNum);
        env.TranslationEnginesClient.GetAllPretranslationsAsync(
                TranslationEngine01,
                ParallelCorpus01,
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
    [Obsolete("Tests legacy corpus")]
    public async Task GetPreTranslationsAsync_LegacyCorpus()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { MockLegacyPreTranslationParameters = true });
        const int bookNum = 64;
        const int chapterNum = 1;
        string textId = PreTranslationService.GetTextId(bookNum, chapterNum);
        env.TranslationEnginesClient.GetAllCorpusPretranslationsAsync(
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
    public async Task GetPreTranslationsAsync_ReturnsEmptyArrayIfNoPreTranslations_Paratext()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { MockPreTranslationParameters = true, UseParatextZipFile = true }
        );
        const int bookNum = 40;
        const int chapterNum = 1;
        string textId = PreTranslationService.GetTextId(bookNum);
        env.TranslationEnginesClient.GetAllPretranslationsAsync(
                TranslationEngine01,
                ParallelCorpus01,
                textId,
                CancellationToken.None
            )
            .Returns(Task.FromResult<IList<Pretranslation>>([]));

        // SUT
        PreTranslation[] actual = await env.Service.GetPreTranslationsAsync(
            Project01,
            bookNum,
            chapterNum,
            CancellationToken.None
        );
        Assert.Zero(actual.Length);
        await env
            .TranslationEnginesClient.Received()
            .GetAllPretranslationsAsync(TranslationEngine01, ParallelCorpus01, textId, CancellationToken.None);
    }

    [Test]
    public async Task GetPreTranslationsAsync_ReturnsEmptyArrayIfNoPreTranslations_Text()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { MockPreTranslationParameters = true });
        const int bookNum = 40;
        const int chapterNum = 1;
        string textId = PreTranslationService.GetTextId(bookNum, chapterNum);
        env.TranslationEnginesClient.GetAllPretranslationsAsync(
                TranslationEngine01,
                ParallelCorpus01,
                textId,
                CancellationToken.None
            )
            .Returns(Task.FromResult<IList<Pretranslation>>([]));

        // SUT
        PreTranslation[] actual = await env.Service.GetPreTranslationsAsync(
            Project01,
            bookNum,
            chapterNum,
            CancellationToken.None
        );
        Assert.Zero(actual.Length);
        await env
            .TranslationEnginesClient.Received()
            .GetAllPretranslationsAsync(TranslationEngine01, ParallelCorpus01, textId, CancellationToken.None);
    }

    [Test]
    public async Task GetPreTranslationsAsync_ReturnsUsablePreTranslations_Paratext()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { MockPreTranslationParameters = true, UseParatextZipFile = true }
        );
        const int bookNum = 40;
        const int chapterNum = 1;
        string textId = PreTranslationService.GetTextId(bookNum);
        env.TranslationEnginesClient.GetAllPretranslationsAsync(
                TranslationEngine01,
                ParallelCorpus01,
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
                            Refs = { "MAT 1:2/0:q1" },
                            Translation = "Abraham was the father of Isaac ,",
                        },
                        new Pretranslation
                        {
                            TextId = "MAT",
                            Refs = { "MAT 1:2/1:q2" },
                            Translation = "Isaac was the father of James ,",
                        },
                        new Pretranslation
                        {
                            TextId = "MAT",
                            Refs = { "MAT 1:2/2:q3" },
                            Translation = "and James was the father of Jude and his brethren .",
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
        var env = new TestEnvironment(new TestEnvironmentOptions { MockPreTranslationParameters = true });
        const int bookNum = 40;
        const int chapterNum = 1;
        string textId = PreTranslationService.GetTextId(bookNum, chapterNum);
        env.TranslationEnginesClient.GetAllPretranslationsAsync(
                TranslationEngine01,
                ParallelCorpus01,
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
    [Obsolete("Uses legacy corpus")]
    public async Task GetPreTranslationUsfmAsync_LegacyCorpus()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { MockLegacyPreTranslationParameters = true, UseParatextZipFile = true }
        );
        env.TranslationEnginesClient.GetCorpusPretranslatedUsfmAsync(
                id: Arg.Any<string>(),
                corpusId: Arg.Any<string>(),
                textId: "MAT",
                textOrigin: PretranslationUsfmTextOrigin.OnlyPretranslated,
                template: PretranslationUsfmTemplate.Source,
                paragraphMarkerBehavior: Arg.Any<PretranslationUsfmMarkerBehavior>(),
                embedBehavior: PretranslationUsfmMarkerBehavior.Strip,
                styleMarkerBehavior: PretranslationUsfmMarkerBehavior.Strip,
                quoteNormalizationBehavior: Arg.Any<PretranslationNormalizationBehavior>(),
                cancellationToken: CancellationToken.None
            )
            .Returns(TestEnvironment.MatthewBookUsfm);

        // SUT
        string usfm = await env.Service.GetPreTranslationUsfmAsync(
            Project01,
            40,
            0,
            new DraftUsfmConfig(),
            CancellationToken.None
        );
        Assert.AreEqual(TestEnvironment.MatthewBookUsfm, usfm);
    }

    [Test]
    public async Task GetPreTranslationUsfmAsync_ReturnsEntireBook()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { MockPreTranslationParameters = true, UseParatextZipFile = true }
        );

        // SUT
        string usfm = await env.Service.GetPreTranslationUsfmAsync(
            Project01,
            40,
            0,
            new DraftUsfmConfig(),
            CancellationToken.None
        );
        Assert.AreEqual(TestEnvironment.MatthewBookUsfm, usfm);
    }

    [Test]
    public async Task GetPreTranslationUsfmAsync_ReturnsChapterOneWithIntroductoryMaterial()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { MockPreTranslationParameters = true, UseParatextZipFile = true }
        );

        // SUT
        string usfm = await env.Service.GetPreTranslationUsfmAsync(
            Project01,
            40,
            1,
            new DraftUsfmConfig(),
            CancellationToken.None
        );
        Assert.AreEqual(TestEnvironment.MatthewChapterOneUsfm, usfm);
    }

    [Test]
    public async Task GetPreTranslationUsfmAsync_ReturnsSpecificChapter()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { MockPreTranslationParameters = true, UseParatextZipFile = true }
        );

        // SUT
        string usfm = await env.Service.GetPreTranslationUsfmAsync(
            Project01,
            40,
            2,
            new DraftUsfmConfig(),
            CancellationToken.None
        );
        Assert.AreEqual(TestEnvironment.MatthewChapterTwoUsfm, usfm);
    }

    [Test]
    public async Task GetPreTranslationUsfmAsync_ParagraphFormatSpecified()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { MockPreTranslationParameters = true, UseParatextZipFile = true }
        );

        // SUT
        await env.Service.GetPreTranslationUsfmAsync(
            Project01,
            40,
            2,
            config: new DraftUsfmConfig { ParagraphFormat = ParagraphBreakFormatOptions.Remove },
            CancellationToken.None
        );
        await env
            .TranslationEnginesClient.Received(1)
            .GetPretranslatedUsfmAsync(
                Arg.Any<string>(),
                Arg.Any<string>(),
                "MAT",
                Arg.Any<PretranslationUsfmTextOrigin>(),
                Arg.Any<PretranslationUsfmTemplate>(),
                paragraphMarkerBehavior: PretranslationUsfmMarkerBehavior.Strip,
                embedBehavior: PretranslationUsfmMarkerBehavior.Strip,
                styleMarkerBehavior: PretranslationUsfmMarkerBehavior.Strip,
                quoteNormalizationBehavior: PretranslationNormalizationBehavior.Denormalized,
                cancellationToken: CancellationToken.None
            );

        // SUT2
        await env.Service.GetPreTranslationUsfmAsync(
            Project01,
            40,
            2,
            config: new DraftUsfmConfig { ParagraphFormat = ParagraphBreakFormatOptions.BestGuess },
            CancellationToken.None
        );
        await env
            .TranslationEnginesClient.Received(1)
            .GetPretranslatedUsfmAsync(
                Arg.Any<string>(),
                Arg.Any<string>(),
                "MAT",
                Arg.Any<PretranslationUsfmTextOrigin>(),
                Arg.Any<PretranslationUsfmTemplate>(),
                paragraphMarkerBehavior: PretranslationUsfmMarkerBehavior.PreservePosition,
                embedBehavior: PretranslationUsfmMarkerBehavior.Strip,
                styleMarkerBehavior: PretranslationUsfmMarkerBehavior.Strip,
                quoteNormalizationBehavior: PretranslationNormalizationBehavior.Denormalized,
                cancellationToken: CancellationToken.None
            );

        // SUT3
        await env.Service.GetPreTranslationUsfmAsync(
            Project01,
            40,
            2,
            config: new DraftUsfmConfig { ParagraphFormat = ParagraphBreakFormatOptions.MoveToEnd },
            CancellationToken.None
        );
        await env
            .TranslationEnginesClient.Received(1)
            .GetPretranslatedUsfmAsync(
                Arg.Any<string>(),
                Arg.Any<string>(),
                "MAT",
                Arg.Any<PretranslationUsfmTextOrigin>(),
                Arg.Any<PretranslationUsfmTemplate>(),
                paragraphMarkerBehavior: PretranslationUsfmMarkerBehavior.Preserve,
                embedBehavior: PretranslationUsfmMarkerBehavior.Strip,
                styleMarkerBehavior: PretranslationUsfmMarkerBehavior.Strip,
                quoteNormalizationBehavior: PretranslationNormalizationBehavior.Denormalized,
                cancellationToken: CancellationToken.None
            );
    }

    [Test]
    public async Task GetPreTranslationUsfmAsync_QuoteFormatSpecified()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { MockPreTranslationParameters = true, UseParatextZipFile = true }
        );

        // SUT
        await env.Service.GetPreTranslationUsfmAsync(
            Project01,
            40,
            2,
            config: new DraftUsfmConfig { QuoteFormat = QuoteStyleOptions.Normalized },
            CancellationToken.None
        );
        await env
            .TranslationEnginesClient.Received(1)
            .GetPretranslatedUsfmAsync(
                Arg.Any<string>(),
                Arg.Any<string>(),
                "MAT",
                Arg.Any<PretranslationUsfmTextOrigin>(),
                Arg.Any<PretranslationUsfmTemplate>(),
                paragraphMarkerBehavior: PretranslationUsfmMarkerBehavior.PreservePosition,
                embedBehavior: PretranslationUsfmMarkerBehavior.Strip,
                styleMarkerBehavior: PretranslationUsfmMarkerBehavior.Strip,
                quoteNormalizationBehavior: PretranslationNormalizationBehavior.Normalized,
                cancellationToken: CancellationToken.None
            );

        // SUT2
        await env.Service.GetPreTranslationUsfmAsync(
            Project01,
            40,
            2,
            config: new DraftUsfmConfig { QuoteFormat = QuoteStyleOptions.Denormalized },
            CancellationToken.None
        );
        await env
            .TranslationEnginesClient.Received(1)
            .GetPretranslatedUsfmAsync(
                Arg.Any<string>(),
                Arg.Any<string>(),
                "MAT",
                Arg.Any<PretranslationUsfmTextOrigin>(),
                Arg.Any<PretranslationUsfmTemplate>(),
                paragraphMarkerBehavior: PretranslationUsfmMarkerBehavior.PreservePosition,
                embedBehavior: PretranslationUsfmMarkerBehavior.Strip,
                styleMarkerBehavior: PretranslationUsfmMarkerBehavior.Strip,
                quoteNormalizationBehavior: PretranslationNormalizationBehavior.Denormalized,
                cancellationToken: CancellationToken.None
            );
    }

    [Test]
    public async Task GetPreTranslationUsfmAsync_ReturnsEmptyStringForMissingChapter()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { MockPreTranslationParameters = true, UseParatextZipFile = true }
        );

        // SUT
        string usfm = await env.Service.GetPreTranslationUsfmAsync(
            Project01,
            40,
            3,
            new DraftUsfmConfig(),
            CancellationToken.None
        );
        Assert.IsEmpty(usfm);
    }

    private class TestEnvironmentOptions
    {
        public bool MockLegacyPreTranslationParameters { get; init; }
        public bool MockPreTranslationParameters { get; init; }
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
            ProjectSecrets = new MemoryRepository<SFProjectSecret>([new SFProjectSecret { Id = Project01 }]);
            TranslationEnginesClient = Substitute.For<ITranslationEnginesClient>();
            TranslationEnginesClient
                .GetPretranslatedUsfmAsync(
                    id: Arg.Any<string>(),
                    parallelCorpusId: Arg.Any<string>(),
                    textId: "MAT",
                    textOrigin: PretranslationUsfmTextOrigin.OnlyPretranslated,
                    template: PretranslationUsfmTemplate.Source,
                    paragraphMarkerBehavior: Arg.Any<PretranslationUsfmMarkerBehavior>(),
                    embedBehavior: PretranslationUsfmMarkerBehavior.Strip,
                    styleMarkerBehavior: PretranslationUsfmMarkerBehavior.Strip,
                    quoteNormalizationBehavior: Arg.Any<PretranslationNormalizationBehavior>(),
                    cancellationToken: CancellationToken.None
                )
                .Returns(MatthewBookUsfm);
            Service = Substitute.ForPartsOf<PreTranslationService>(ProjectSecrets, TranslationEnginesClient);
            if (options.MockPreTranslationParameters)
            {
                Service
                    .Configure()
                    .GetPreTranslationParametersAsync(Project01)
                    .Returns(
                        Task.FromResult<(string, string, string, bool)>(
                            (TranslationEngine01, Corpus01, null, options.UseParatextZipFile)
                        )
                    );
            }
            else if (options.MockPreTranslationParameters)
            {
                Service
                    .Configure()
                    .GetPreTranslationParametersAsync(Project01)
                    .Returns(
                        Task.FromResult<(string, string, string, bool)>(
                            (TranslationEngine01, null, ParallelCorpus01, options.UseParatextZipFile)
                        )
                    );
            }
        }

        private MemoryRepository<SFProjectSecret> ProjectSecrets { get; }
        public PreTranslationService Service { get; }
        public ITranslationEnginesClient TranslationEnginesClient { get; }

        /// <summary>
        /// Sets up the Project Secret.
        /// </summary>
        /// <param name="servalData">The Serval configuration data.</param>
        /// <returns>The asynchronous task.</returns>
        public async Task SetupProjectSecretAsync(ServalData? servalData) =>
            await ProjectSecrets.UpdateAsync(Project01, u => u.Set(p => p.ServalData, servalData));
    }
}
