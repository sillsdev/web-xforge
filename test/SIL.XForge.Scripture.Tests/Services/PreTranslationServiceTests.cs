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

    [Test]
    public async Task GetPreTranslationParametersAsync_CompatibleWithLegacyCorpora()
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
                        new ServalCorpus { PreTranslate = true }
                    },
                },
            }
        );

        // SUT
        (string translationEngineId, string? corpusId, string? parallelCorpusId) =
            await env.Service.GetPreTranslationParametersAsync(Project01);
        Assert.AreEqual(TranslationEngine01, translationEngineId);
        Assert.AreEqual(Corpus01, corpusId);
        Assert.IsNull(parallelCorpusId);
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
        (string translationEngineId, string? corpusId, string? parallelCorpusId) =
            await env.Service.GetPreTranslationParametersAsync(Project01);
        Assert.AreEqual(TranslationEngine01, translationEngineId);
        Assert.IsNull(corpusId);
        Assert.AreEqual(ParallelCorpus01, parallelCorpusId);
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
        var env = new TestEnvironment(new TestEnvironmentOptions { MockLegacyPreTranslationParameters = true });
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
        var env = new TestEnvironment(new TestEnvironmentOptions { MockPreTranslationParameters = true });

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
        var env = new TestEnvironment(new TestEnvironmentOptions { MockPreTranslationParameters = true });

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
        var env = new TestEnvironment(new TestEnvironmentOptions { MockPreTranslationParameters = true });

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
        var env = new TestEnvironment(new TestEnvironmentOptions { MockPreTranslationParameters = true });

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
        var env = new TestEnvironment(new TestEnvironmentOptions { MockPreTranslationParameters = true });

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
        var env = new TestEnvironment(new TestEnvironmentOptions { MockPreTranslationParameters = true });

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

    [Test]
    public async Task GetVerseConfidencesAsync_LegacyCorpus()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { MockLegacyPreTranslationParameters = true });

        // SUT
        IEnumerable<VerseConfidence> actual = await env.Service.GetVerseConfidencesAsync(
            Project01,
            CancellationToken.None
        );
        Assert.IsEmpty(actual);
    }

    [Test]
    public async Task GetVerseConfidencesAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { MockPreTranslationParameters = true });

        // SUT
        List<VerseConfidence> actual =
        [
            .. await env.Service.GetVerseConfidencesAsync(Project01, CancellationToken.None),
        ];
        Assert.That(actual, Has.Count.EqualTo(2));
        Assert.That(actual[0], Is.EqualTo(new VerseConfidence(40, 1, "1", 0.2)).UsingPropertiesComparer());
        Assert.That(actual[1], Is.EqualTo(new VerseConfidence(40, 1, "3", 0.6)).UsingPropertiesComparer());
    }

    private class TestEnvironmentOptions
    {
        public bool MockLegacyPreTranslationParameters { get; init; }
        public bool MockPreTranslationParameters { get; init; }
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
            TranslationEnginesClient
                .GetAllPretranslationConfidencesAsync(
                    id: Arg.Any<string>(),
                    parallelCorpusId: Arg.Any<string>(),
                    cancellationToken: CancellationToken.None
                )
                .Returns(
                    Task.FromResult<IList<PretranslationConfidence>>([
                        new PretranslationConfidence
                        {
                            // A pre-translation confidence value with no references (ignored)
                            SourceRefs = [],
                            TargetRefs = [],
                            Confidence = 0.1,
                        },
                        new PretranslationConfidence
                        {
                            // A pre-translation confidence value from a build of Serval before 1.18.0
                            SourceRefs = [],
                            TargetRefs = ["MAT 1:1"],
                            Confidence = 0.2,
                        },
                        new PretranslationConfidence
                        {
                            // A pre-translation confidence value with an invalid references (ignored)
                            SourceRefs = ["invalid_reference"],
                            TargetRefs = ["invalid_reference"],
                            Confidence = 0.3,
                        },
                        new PretranslationConfidence
                        {
                            // A pre-translation confidence value from verse that only has a segment (ignored)
                            SourceRefs = ["MAT 1:2/1:s"],
                            TargetRefs = ["MAT 1:2/1:s"],
                            Confidence = 0.4,
                        },
                        new PretranslationConfidence
                        {
                            // A pre-translation confidence value from a segment (ignored)
                            SourceRefs = ["MAT 1:3/2:s"],
                            TargetRefs = ["MAT 1:3/2:s"],
                            Confidence = 0.5,
                        },
                        new PretranslationConfidence
                        {
                            // A pre-translation confidence value for a verse
                            SourceRefs = ["MAT 1:3"],
                            TargetRefs = ["MAT 1:3"],
                            Confidence = 0.6,
                        },
                        new PretranslationConfidence
                        {
                            // A pre-translation confidence value for verse zero (ignored)
                            SourceRefs = ["MAT 1:0"],
                            TargetRefs = ["MAT 1:0"],
                            Confidence = 0.7,
                        },
                    ])
                );
            Service = Substitute.ForPartsOf<PreTranslationService>(ProjectSecrets, TranslationEnginesClient);
            if (options.MockLegacyPreTranslationParameters)
            {
                Service
                    .Configure()
                    .GetPreTranslationParametersAsync(Project01)
                    .Returns(Task.FromResult<(string, string?, string?)>((TranslationEngine01, Corpus01, null)));
            }
            else if (options.MockPreTranslationParameters)
            {
                Service
                    .Configure()
                    .GetPreTranslationParametersAsync(Project01)
                    .Returns(
                        Task.FromResult<(string, string?, string?)>((TranslationEngine01, null, ParallelCorpus01))
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
