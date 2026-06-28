using System;
using System.Collections.Generic;
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
        (string translationEngineId, string? corpusId, string? parallelCorpusId, bool useParatextVerseRef) =
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
        (string translationEngineId, string? corpusId, string? parallelCorpusId, bool useParatextVerseRef) =
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
            if (options.MockLegacyPreTranslationParameters)
            {
                Service
                    .Configure()
                    .GetPreTranslationParametersAsync(Project01)
                    .Returns(
                        Task.FromResult<(string, string?, string?, bool)>(
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
                        Task.FromResult<(string, string?, string?, bool)>(
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
