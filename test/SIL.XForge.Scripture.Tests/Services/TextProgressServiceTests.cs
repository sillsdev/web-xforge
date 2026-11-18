#nullable disable warnings
using System;
using System.Linq;
using System.Threading.Tasks;
using System.Xml.Linq;
using EphemeralMongo;
using Microsoft.Extensions.Logging;
using MongoDB.Bson;
using MongoDB.Driver;
using Newtonsoft.Json.Linq;
using NSubstitute;
using NUnit.Framework;
using Paratext.Data;
using SIL.Scripture;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Tests the progress aggregation pipeline against a real MongoDB instance (via EphemeralMongo), because an
/// aggregation pipeline can only be meaningfully tested by executing it.
///
/// IMPORTANT: The text document fixtures are written as USFM and converted the way sync converts a book: ParatextData's
/// USFM to USX conversion, then <see cref="ParatextSyncRunner.UsxToXDocument"/>, then <see cref="DeltaUsxMapper"/>.
/// They must never be hand-written USX or ops JSON. The pipeline depends on details of the resulting delta
/// representation (segment refs, continuation suffixes, blank ops, and the whitespace Paratext leaves between
/// elements; see the data contract on <see cref="TextProgressService"/>), and hand-built input is easy to get subtly
/// wrong in ways real data never is. Write the USFM the way Paratext saves it, with each paragraph marker and verse
/// marker at the start of a line.
/// </summary>
[TestFixture]
public class TextProgressServiceTests
{
    private const string Project01 = "project01";
    private const string DatabaseName = "text_progress_service_tests";

    private static IMongoRunner _mongoRunner;
    private static IMongoClient _mongoClient;

    private TextProgressService _service;
    private IMongoCollection<BsonDocument> _texts;
    private DeltaUsxMapper _mapper;
    private ScrText _scrText;
    private ScrStylesheet _stylesheet;

    [OneTimeSetUp]
    public static void StartMongo()
    {
        // A directory containing mongod can be supplied for environments where the automatic binary download is
        // not possible; otherwise EphemeralMongo downloads and caches a binary itself.
        string binaryDirectory = Environment.GetEnvironmentVariable("EPHEMERAL_MONGO_BINARY_DIRECTORY");
        var options = new MongoRunnerOptions();
        if (!string.IsNullOrEmpty(binaryDirectory))
            options.BinaryDirectory = binaryDirectory;
        _mongoRunner = MongoRunner.Run(options);
        _mongoClient = new MongoClient(_mongoRunner.ConnectionString);
    }

    [OneTimeTearDown]
    public static void StopMongo() => _mongoRunner?.Dispose();

    [SetUp]
    public async Task InitAsync()
    {
        var realtimeService = Substitute.For<IRealtimeService>();
        realtimeService.GetCollectionName<TextData>().Returns("texts");
        await _mongoClient.GetDatabase(DatabaseName).DropCollectionAsync("texts");
        _texts = _mongoClient.GetDatabase(DatabaseName).GetCollection<BsonDocument>("texts");
        _mapper = new DeltaUsxMapper(
            new TestGuidService(),
            Substitute.For<ILogger<DeltaUsxMapper>>(),
            Substitute.For<IExceptionHandler>()
        );
        _scrText = new MockScrText(new SFParatextUser("ptUser01"), new ProjectName());
        _stylesheet = new MockScrStylesheet("usfm.sty");
        _service = new TextProgressService(_mongoClient.GetDatabase(DatabaseName), realtimeService);
    }

    [Test]
    public async Task GetBookProgressAsync_ParagraphInitialVerseNumber_ContinuationBlankIsNotMissing()
    {
        // Verse 2's text ends at the paragraph break, so the paragraph that opens with "\v 3" produces a blank
        // continuation segment (verse_1_2/p_1). Every verse is translated, so nothing is blank.
        await InsertBookAsync(
            Project01,
            """
            \id RUT
            \c 1
            \p
            \v 1 Verse one text.
            \v 2 Verse two text.
            \p
            \v 3 Verse three text.
            """
        );

        // SUT
        BookProgress[] progress = await _service.GetBookProgressAsync(Project01, ScrVers.English);

        Assert.That(progress.Single().Verses, Is.EqualTo(3));
        Assert.That(progress.Single().BlankVerses, Is.EqualTo(0));
    }

    [Test]
    public async Task GetBookProgressAsync_EmptyVerse_CountedAsBlank()
    {
        await InsertBookAsync(
            Project01,
            """
            \id RUT
            \c 1
            \p
            \v 1 Verse one text.
            \v 2
            \v 3 Verse three.
            """
        );

        // SUT
        BookProgress[] progress = await _service.GetBookProgressAsync(Project01, ScrVers.English);

        Assert.That(progress.Single().Verses, Is.EqualTo(3));
        Assert.That(progress.Single().BlankVerses, Is.EqualTo(1));
    }

    [Test]
    public async Task GetBookProgressAsync_VerseSplitAcrossParagraphs_CountedOnce()
    {
        // Verse 1 has text in its lead segment and in its continuation segment in the next paragraph.
        await InsertBookAsync(
            Project01,
            """
            \id RUT
            \c 1
            \p
            \v 1 Start of verse one,
            \p and the rest of verse one.
            \v 2 Verse two.
            """
        );

        // SUT
        BookProgress[] progress = await _service.GetBookProgressAsync(Project01, ScrVers.English);

        Assert.That(progress.Single().Verses, Is.EqualTo(2));
        Assert.That(progress.Single().BlankVerses, Is.EqualTo(0));
    }

    [Test]
    public async Task GetBookProgressAsync_BlankLeadSegmentWithFilledContinuation_Translated()
    {
        // "\v 1" is the last thing in its paragraph, so the verse's lead segment is blank and all of its text is
        // in the continuation segment.
        await InsertBookAsync(
            Project01,
            """
            \id RUT
            \c 1
            \p
            \v 1
            \p All of the text of verse one.
            """
        );

        // SUT
        BookProgress[] progress = await _service.GetBookProgressAsync(Project01, ScrVers.English);

        Assert.That(progress.Single().Verses, Is.EqualTo(1));
        Assert.That(progress.Single().BlankVerses, Is.EqualTo(0));
    }

    [Test]
    public async Task GetBookProgressAsync_PoetryLinesAndBlankLine_NotMissing()
    {
        // A verse spanning poetry lines produces a continuation segment per line, and "\b" produces a
        // continuation segment that the USFM spec requires to be empty. The empty continuation line of verse 2
        // does not make the verse blank.
        await InsertBookAsync(
            Project01,
            """
            \id RUT
            \c 1
            \q1
            \v 1 First line of verse one,
            \q2 second line of verse one.
            \b
            \q1
            \v 2 First line of verse two.
            \q2
            """
        );

        // SUT
        BookProgress[] progress = await _service.GetBookProgressAsync(Project01, ScrVers.English);

        Assert.That(progress.Single().Verses, Is.EqualTo(2));
        Assert.That(progress.Single().BlankVerses, Is.EqualTo(0));
    }

    [Test]
    public async Task GetBookProgressAsync_MultiOpSegment_CountedOnce()
    {
        // Character styling and a mid-verse footnote split a verse segment into multiple ops, which still count as one
        // verse. The footnote isn't content, but the text around it is, so the verse is translated.
        await InsertBookAsync(
            Project01,
            """
            \id RUT
            \c 1
            \p
            \v 1 Text before \nd Lord\nd* and after\f + \ft A footnote.\f* the note.
            \v 2 Verse two.
            """
        );

        // SUT
        BookProgress[] progress = await _service.GetBookProgressAsync(Project01, ScrVers.English);

        Assert.That(progress.Single().Verses, Is.EqualTo(2));
        Assert.That(progress.Single().BlankVerses, Is.EqualTo(0));
    }

    /// <summary>
    /// Content that is stored in a verse's segment but displays no verse text. Each case is the whole of verse 1.
    /// </summary>
    private static readonly TestCaseData[] NonTextVerseContent =
    [
        new TestCaseData(@"\f + \ft Footnote only.\f*").SetArgDisplayNames("Footnote"),
        // Cross references are often imported from another project before any verse is translated
        new TestCaseData(@"\x - \xo 1.1: \xt Jdg 2.16\x*").SetArgDisplayNames("CrossReference"),
        // A textless character-style pair becomes an {insert: {empty: true}} placeholder op
        new TestCaseData(@"\nd \nd*").SetArgDisplayNames("EmptyCharStyle"),
        // The caption is stored inside the figure embed, not as text in the verse's segment
        new TestCaseData(@"\fig Caption|src=""file.jpg"" size=""col"" ref=""RUT 1:1""\fig*").SetArgDisplayNames(
            "Figure"
        ),
        new TestCaseData(@"\ts-s\*").SetArgDisplayNames("Milestone"),
        new TestCaseData("//").SetArgDisplayNames("OptionalBreak"),
    ];

    [TestCaseSource(nameof(NonTextVerseContent))]
    public async Task GetBookProgressAsync_VerseWithNoText_CountedAsBlank(string verseOneContent)
    {
        await InsertBookAsync(
            Project01,
            $"""
            \id RUT
            \c 1
            \p
            \v 1 {verseOneContent}
            \v 2 Verse two.
            """
        );

        // SUT
        BookProgress[] progress = await _service.GetBookProgressAsync(Project01, ScrVers.English);

        Assert.That(progress.Single().Verses, Is.EqualTo(2));
        Assert.That(progress.Single().BlankVerses, Is.EqualTo(1));
    }

    [Test]
    public async Task GetBookProgressAsync_VerseRange_OneUnit()
    {
        await InsertBookAsync(
            Project01,
            """
            \id RUT
            \c 1
            \p
            \v 1 Verse one.
            \v 2-3 Verses two and three.
            """
        );

        // SUT
        BookProgress[] progress = await _service.GetBookProgressAsync(Project01, ScrVers.English);

        Assert.That(progress.Single().Verses, Is.EqualTo(2));
    }

    [Test]
    public async Task GetBookProgressAsync_HeadingSegments_NotCounted()
    {
        // Headings and intro paragraphs produce non-verse segments (s_1, ip_1, and the blank p_1 between a
        // heading and the first verse number), which are not verse units.
        await InsertBookAsync(
            Project01,
            """
            \id RUT
            \c 1
            \s A section heading
            \p
            \v 1 Verse one text.
            """
        );

        // SUT
        BookProgress[] progress = await _service.GetBookProgressAsync(Project01, ScrVers.English);

        Assert.That(progress.Single().Verses, Is.EqualTo(1));
        Assert.That(progress.Single().BlankVerses, Is.EqualTo(0));
    }

    [Test]
    public async Task GetBookProgressAsync_ChapterWithoutVerseSegments_KeptWithZeroCounts()
    {
        // A chapter that holds only a heading still exists in the project. Consumers (e.g.
        // DraftProgressService.getPresentChapters) distinguish "exists but empty" from "does not exist" by the
        // chapter's presence in the result, so it must be kept, with zero counts.
        await InsertBookAsync(
            Project01,
            """
            \id RUT
            \c 1
            \p
            \v 1 Verse one text.
            \c 2
            \s A heading, and no verses yet
            """
        );

        // SUT
        BookProgress[] progress = await _service.GetBookProgressAsync(Project01, ScrVers.English);

        Assert.That(progress.Single().Chapters.Select(chapter => chapter.ChapterNumber), Is.EqualTo([1, 2]));
        Assert.That(progress.Single().Chapters[1].Verses, Is.EqualTo(0));
        Assert.That(progress.Single().Chapters[1].BlankVerses, Is.EqualTo(0));
        Assert.That(progress.Single().Verses, Is.EqualTo(1));
    }

    [Test]
    public async Task GetBookProgressAsync_MultipleBooksChaptersAndProjects_GroupedPerBook()
    {
        await InsertBookAsync(
            Project01,
            """
            \id RUT
            \c 1
            \p
            \v 1 Ruth 1:1.
            \v 2
            \c 2
            \p
            \v 1 Ruth 2:1.
            """
        );
        await InsertBookAsync(
            Project01,
            """
            \id JON
            \c 1
            \p
            \v 1 Jonah 1:1.
            """
        );
        // Another project's documents must not be included
        await InsertBookAsync(
            "project02",
            """
            \id RUT
            \c 1
            \p
            \v 1
            """
        );

        // SUT
        BookProgress[] progress = await _service.GetBookProgressAsync(Project01, ScrVers.English);

        Assert.That(progress.Length, Is.EqualTo(2));
        BookProgress ruth = progress.Single(book => book.BookId == "RUT");
        Assert.That(ruth.Verses, Is.EqualTo(3));
        Assert.That(ruth.BlankVerses, Is.EqualTo(1));
        Assert.That(ruth.Chapters.Select(chapter => chapter.ChapterNumber), Is.EqualTo([1, 2]));
        Assert.That(ruth.Chapters[0].Verses, Is.EqualTo(2));
        Assert.That(ruth.Chapters[0].BlankVerses, Is.EqualTo(1));
        Assert.That(ruth.Chapters[1].Verses, Is.EqualTo(1));
        Assert.That(ruth.Chapters[1].BlankVerses, Is.EqualTo(0));
        BookProgress jonah = progress.Single(book => book.BookId == "JON");
        Assert.That(jonah.Verses, Is.EqualTo(1));
        Assert.That(jonah.BlankVerses, Is.EqualTo(0));
        Assert.That(jonah.Chapters.Single().ChapterNumber, Is.EqualTo(1));
    }

    [Test]
    public async Task GetBookProgressAsync_ExpectedVerses_FromVersification()
    {
        // Ruth has 22, 23, 18 and 22 verses in the English versification. Only chapter 1 exists in the project, so
        // the book's expected count exceeds the sum over its chapters by the size of the missing chapters, and a
        // chapter the versification does not have expects no verses.
        await InsertBookAsync(
            Project01,
            """
            \id RUT
            \c 1
            \p
            \v 1 Verse one.
            \c 5
            \p
            \v 1 A chapter beyond the versification.
            """
        );

        // SUT
        BookProgress[] progress = await _service.GetBookProgressAsync(Project01, ScrVers.English);

        Assert.That(progress.Single().ExpectedVerses, Is.EqualTo(85));
        Assert.That(progress.Single().Chapters[0].ExpectedVerses, Is.EqualTo(22));
        Assert.That(progress.Single().Chapters[1].ExpectedVerses, Is.EqualTo(0));
    }

    [Test]
    public async Task GetBookProgressAsync_NonCanonicalBook_HasNoExpectedVerses()
    {
        // The versification only describes canonical books. It nominally has 998 chapters of front matter, which
        // would count as hundreds of thousands of untranslated verses, so such a book gets no expected count.
        await InsertBookAsync(
            Project01,
            """
            \id FRT
            \ip Front matter.
            """
        );
        await InsertBookAsync(
            Project01,
            """
            \id RUT
            \c 1
            \p
            \v 1 Verse one.
            """
        );

        // SUT
        BookProgress[] progress = await _service.GetBookProgressAsync(Project01, ScrVers.English);

        BookProgress frontMatter = progress.Single(book => book.BookId == "FRT");
        Assert.That(frontMatter.ExpectedVerses, Is.Null);
        Assert.That(frontMatter.Chapters.Single().ExpectedVerses, Is.EqualTo(0));
        Assert.That(progress.Single(book => book.BookId == "RUT").ExpectedVerses, Is.EqualTo(85));
    }

    [Test]
    public async Task GetBookProgressAsync_DocsWithoutOps_Ignored()
    {
        await InsertBookAsync(
            Project01,
            """
            \id RUT
            \c 1
            \p
            \v 1 Verse one.
            """
        );
        await _texts.InsertOneAsync(
            new BsonDocument { { "_id", $"{Project01}:JON:1:target" }, { "ops", BsonNull.Value } }
        );
        await _texts.InsertOneAsync(new BsonDocument { { "_id", $"{Project01}:JON:2:target" } });

        // SUT
        BookProgress[] progress = await _service.GetBookProgressAsync(Project01, ScrVers.English);

        Assert.That(progress.Single().BookId, Is.EqualTo("RUT"));
        Assert.That(progress.Single().Verses, Is.EqualTo(1));
    }

    /// <summary>
    /// Converts a book's USFM to text documents the way sync does, and inserts them into the texts collection. See
    /// the class comment.
    /// </summary>
    private async Task InsertBookAsync(string projectId, string usfm)
    {
        string bookId = DeltaUsxMapper.ExtractBookId(usfm);
        string usx = UsfmToUsx.ConvertToXmlString(_scrText, _stylesheet, usfm, false);
        XDocument usxDoc = ParatextSyncRunner.UsxToXDocument(usx);
        foreach (ChapterDelta chapterDelta in _mapper.ToChapterDeltas(usxDoc))
        {
            string opsJson = new JObject(new JProperty("ops", new JArray(chapterDelta.Delta.Ops))).ToString();
            BsonDocument textDoc = BsonDocument.Parse(opsJson);
            textDoc["_id"] = TextData.GetTextDocId(projectId, bookId, chapterDelta.Number);
            await _texts.InsertOneAsync(textDoc);
        }
    }
}
