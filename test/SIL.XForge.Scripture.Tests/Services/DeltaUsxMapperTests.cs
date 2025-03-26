using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Xml;
using System.Xml.Linq;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;
using NSubstitute;
using NUnit.Framework;
using Paratext.Data;
using SIL.XForge.Realtime.RichText;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class DeltaUsxMapperTests
{
    private IGuidService _mapperGuidService;
    private IGuidService _testGuidService;
    private ILogger<DeltaUsxMapper> _logger;
    private IExceptionHandler _exceptionHandler;
    private ScrText _scrText;

    [SetUp]
    public void Init()
    {
        _mapperGuidService = new TestGuidService();
        _testGuidService = new TestGuidService();
        _logger = Substitute.For<ILogger<DeltaUsxMapper>>();
        _exceptionHandler = Substitute.For<IExceptionHandler>();
        _scrText = new MockScrText(new SFParatextUser("ptUser01"), new ProjectName());
    }

    [Test]
    public void ToUsx_HeaderPara()
    {
        var chapterDelta = new ChapterDelta(
            1,
            0,
            true,
            Delta.New().InsertText("Philemon", "h_1").InsertPara("h").Insert("\n")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

        XDocument expected = Usx("PHM", Para("h", "Philemon"));
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_VerseText()
    {
        var chapterDelta = new ChapterDelta(
            1,
            1,
            true,
            Delta
                .New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("Verse text.", "verse_1_1")
                .InsertPara("p")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

        XDocument expected = Usx("PHM", Chapter("1"), Para("p", Verse("1"), "Verse text."));
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));

        // And we should be able to roundtrip it back.
        List<ChapterDelta> roundtrippedChapterDeltas = [.. mapper.ToChapterDeltas(newUsxDoc)];
        Assert.IsTrue(roundtrippedChapterDeltas[0].Delta.DeepEquals(chapterDelta.Delta));
    }

    [Test]
    public void ToUsx_EmptySegments()
    {
        var chapterDelta = new ChapterDelta(
            1,
            3,
            true,
            Delta
                .New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertBlank("verse_1_1")
                .InsertVerse("2")
                .InsertBlank("verse_1_2")
                .InsertPara("p")
                .InsertBlank("verse_1_2/li_1")
                .InsertPara("li")
                .InsertBlank("verse_1_2/li_2")
                .InsertPara("li")
                .InsertBlank("verse_1_2/p_3")
                .InsertVerse("3")
                .InsertBlank("verse_1_3")
                .InsertPara("p")
                .Insert("\n")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

        XDocument expected = Usx(
            "PHM",
            Chapter("1"),
            Para("p", Verse("1"), Verse("2")),
            Para("li"),
            Para("li"),
            Para("p", Verse("3"))
        );
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_InvalidChapters()
    {
        // Set up a USX document with two invalid chapters
        XDocument usxDoc = Usx(
            "RUT",
            null,
            "3.0",
            Chapter("1"),
            Verse("1"),
            Chapter("2."),
            Verse("1"),
            Chapter("3"),
            Verse("1"),
            Chapter("4."),
            Verse("1")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);

        // Get the chapter deltas, which will be the valid chapters
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected1 = Delta.New().InsertChapter("1").InsertVerse("1").InsertBlank("verse_1_1").InsertText("\n");
        var expected2 = Delta.New().InsertChapter("3").InsertVerse("1").InsertBlank("verse_3_1").InsertText("\n");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected1));

        Assert.That(chapterDeltas[1].Number, Is.EqualTo(3));
        Assert.That(chapterDeltas[1].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[1].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[1].Delta.DeepEquals(expected2));

        // Ensure that the USX round trips perfectly
        XDocument newUsxDoc = mapper.ToUsx(usxDoc, chapterDeltas);
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, usxDoc));
    }

    [Test]
    public void ToUsx_CharText()
    {
        var chapterDelta = new ChapterDelta(
            1,
            1,
            true,
            Delta
                .New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("This is some ", "verse_1_1")
                .InsertChar("bold", "bd", _testGuidService.Generate(), "verse_1_1")
                .InsertText(" text.", "verse_1_1")
                .InsertPara("p")
                .Insert("\n")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

        XDocument expected = Usx(
            "PHM",
            Chapter("1"),
            Para("p", Verse("1"), "This is some ", Char("bd", "bold"), " text.")
        );
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_EmptyChar()
    {
        var chapterDelta = new ChapterDelta(
            1,
            1,
            true,
            Delta
                .New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("This is some ", "verse_1_1")
                .InsertEmptyChar("bd", _testGuidService.Generate(), "verse_1_1")
                .InsertText(" text.", "verse_1_1")
                .InsertPara("p")
                .Insert("\n")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

        XDocument expected = Usx(
            "PHM",
            Chapter("1"),
            Para("p", Verse("1"), "This is some ", Char("bd", null), " text.")
        );
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_AdjacentChar_SpaceBetweenRetained()
    {
        // Suppose there are two styled runs of text, with a space between them. That space should be retained.
        var chapterDelta = new ChapterDelta(
            1,
            1,
            true,
            Delta
                .New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("This is some ", "verse_1_1")
                .InsertChar("bold", "bd", _testGuidService.Generate(), "verse_1_1")
                .InsertText(" ")
                .InsertChar("hello", "w", _testGuidService.Generate(), "verse_1_1")
                .InsertText(" text.", "verse_1_1")
                .InsertPara("p")
                .Insert("\n")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        // SUT
        XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

        XDocument expected = Usx(
            "PHM",
            Chapter("1"),
            Para("p", Verse("1"), "This is some ", Char("bd", "bold"), " ", Char("w", "hello"), " text.")
        );
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_Note()
    {
        var chapterDelta = new ChapterDelta(
            1,
            1,
            true,
            Delta
                .New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("This is a verse with a footnote", "verse_1_1")
                .InsertNote(
                    Delta
                        .New()
                        .InsertChar("1.1: ", "fr", _testGuidService.Generate())
                        .InsertChar("Refers to ", "ft", _testGuidService.Generate())
                        .InsertChar("a footnote", "fq", _testGuidService.Generate())
                        .Insert(". ")
                        .InsertChar("John 1:1", "xt", _testGuidService.Generate())
                        .Insert(" and ")
                        .InsertChar("Mark 1:1", "xt", _testGuidService.Generate()),
                    "f",
                    "+",
                    "verse_1_1"
                )
                .InsertText(", so that we can test it.", "verse_1_1")
                .InsertPara("p")
                .Insert("\n")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

        XDocument expected = Usx(
            "PHM",
            Chapter("1"),
            Para(
                "p",
                Verse("1"),
                "This is a verse with a footnote",
                Note(
                    "f",
                    "+",
                    Char("fr", "1.1: "),
                    Char("ft", "Refers to "),
                    Char("fq", "a footnote"),
                    ". ",
                    Char("xt", "John 1:1"),
                    " and ",
                    Char("xt", "Mark 1:1")
                ),
                ", so that we can test it."
            )
        );
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_Figure()
    {
        var chapterDelta = new ChapterDelta(
            1,
            1,
            true,
            Delta
                .New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("This is a verse with a figure", "verse_1_1")
                .InsertFigure("file.jpg", "col", "PHM 1:1", "Caption", "verse_1_1")
                .InsertText(", so that we can test it.", "verse_1_1")
                .InsertPara("p")
                .Insert("\n")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

        XDocument expected = Usx(
            "PHM",
            Chapter("1"),
            Para(
                "p",
                Verse("1"),
                "This is a verse with a figure",
                Figure("file.jpg", "col", "PHM 1:1", "Caption"),
                ", so that we can test it."
            )
        );
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_NestedChars()
    {
        string bdCharID = _testGuidService.Generate();
        string sup1CharID = _testGuidService.Generate();
        string sup2CharID = _testGuidService.Generate();
        string sup3CharID = _testGuidService.Generate();
        var chapterDelta = new ChapterDelta(
            1,
            1,
            true,
            Delta
                .New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertChar(
                    "1",
                    new List<CharAttr>
                    {
                        new CharAttr { Style = "bd", CharID = bdCharID },
                        new CharAttr { Style = "sup", CharID = sup1CharID },
                    },
                    "verse_1_1"
                )
                .InsertChar("This is", "bd", bdCharID, "verse_1_1")
                .InsertChar(
                    "2",
                    new List<CharAttr>
                    {
                        new CharAttr { Style = "bd", CharID = bdCharID },
                        new CharAttr { Style = "sup", CharID = sup2CharID },
                    },
                    "verse_1_1"
                )
                .InsertChar(" bold text.", "bd", bdCharID, "verse_1_1")
                .InsertChar(
                    "3",
                    new List<CharAttr>
                    {
                        new CharAttr { Style = "bd", CharID = bdCharID },
                        new CharAttr { Style = "sup", CharID = sup3CharID },
                    },
                    "verse_1_1"
                )
                .InsertText(" This is normal text.", "verse_1_1")
                .InsertPara("p")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

        XDocument expected = Usx(
            "PHM",
            Chapter("1"),
            Para(
                "p",
                Verse("1"),
                Char("bd", Char("sup", "1"), "This is", Char("sup", "2"), " bold text.", Char("sup", "3")),
                " This is normal text."
            )
        );
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_NestedAdjacentChars()
    {
        string bdCharID = _testGuidService.Generate();
        string sup1CharID = _testGuidService.Generate();
        string sup2CharID = _testGuidService.Generate();
        string sup3CharID = _testGuidService.Generate();
        var chapterDelta = new ChapterDelta(
            1,
            1,
            true,
            Delta
                .New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertChar(
                    "1",
                    new List<CharAttr>
                    {
                        new CharAttr { Style = "bd", CharID = bdCharID },
                        new CharAttr { Style = "sup", CharID = sup1CharID },
                    },
                    "verse_1_1"
                )
                .InsertChar(
                    "2",
                    new List<CharAttr>
                    {
                        new CharAttr { Style = "bd", CharID = bdCharID },
                        new CharAttr { Style = "sup", CharID = sup2CharID },
                    },
                    "verse_1_1"
                )
                .InsertChar(
                    "3",
                    new List<CharAttr>
                    {
                        new CharAttr { Style = "bd", CharID = bdCharID },
                        new CharAttr { Style = "sup", CharID = sup3CharID },
                    },
                    "verse_1_1"
                )
                .InsertText(" This is normal text.", "verse_1_1")
                .InsertPara("p")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

        XDocument expected = Usx(
            "PHM",
            Chapter("1"),
            Para(
                "p",
                Verse("1"),
                Char("bd", Char("sup", "1"), Char("sup", "2"), Char("sup", "3")),
                " This is normal text."
            )
        );
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_DoubleNestedAdjacentChars()
    {
        string bdCharID = _testGuidService.Generate();
        string sup1CharID = _testGuidService.Generate();
        string noCharID = _testGuidService.Generate();
        string sup2CharID = _testGuidService.Generate();
        string sup3CharID = _testGuidService.Generate();
        string sup4CharID = _testGuidService.Generate();
        var chapterDelta = new ChapterDelta(
            1,
            1,
            true,
            Delta
                .New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertChar(
                    "1",
                    new List<CharAttr>
                    {
                        new CharAttr { Style = "bd", CharID = bdCharID },
                        new CharAttr { Style = "sup", CharID = sup1CharID },
                    },
                    "verse_1_1"
                )
                .InsertChar("This is bold text", "bd", bdCharID, "verse_1_1")
                .InsertChar(
                    " but this is not bold,",
                    new List<CharAttr>
                    {
                        new CharAttr { Style = "bd", CharID = bdCharID },
                        new CharAttr { Style = "no", CharID = noCharID },
                    },
                    "verse_1_1"
                )
                .InsertChar(
                    "2",
                    new List<CharAttr>
                    {
                        new CharAttr { Style = "bd", CharID = bdCharID },
                        new CharAttr { Style = "no", CharID = noCharID },
                        new CharAttr { Style = "sup", CharID = sup2CharID },
                    },
                    "verse_1_1"
                )
                .InsertChar(
                    "3",
                    new List<CharAttr>
                    {
                        new CharAttr { Style = "bd", CharID = bdCharID },
                        new CharAttr { Style = "no", CharID = noCharID },
                        new CharAttr { Style = "sup", CharID = sup3CharID },
                    },
                    "verse_1_1"
                )
                .InsertChar(" and this is bold.", "bd", bdCharID, "verse_1_1")
                .InsertChar(
                    "4",
                    new List<CharAttr>
                    {
                        new CharAttr { Style = "bd", CharID = bdCharID },
                        new CharAttr { Style = "sup", CharID = sup4CharID },
                    },
                    "verse_1_1"
                )
                .InsertText(" This is normal text.", "verse_1_1")
                .InsertPara("p")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

        XDocument expected = Usx(
            "PHM",
            Chapter("1"),
            Para(
                "p",
                Verse("1"),
                Char(
                    "bd",
                    Char("sup", "1"),
                    "This is bold text",
                    Char("no", " but this is not bold,", Char("sup", "2"), Char("sup", "3")),
                    " and this is bold.",
                    Char("sup", "4")
                ),
                " This is normal text."
            )
        );
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_AdjacentChars()
    {
        var chapterDelta = new ChapterDelta(
            1,
            1,
            true,
            Delta
                .New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertChar("1", "sup", _testGuidService.Generate(), "verse_1_1")
                .InsertChar("2", "sup", _testGuidService.Generate(), "verse_1_1")
                .InsertChar("3", "sup", _testGuidService.Generate(), "verse_1_1")
                .InsertText(" This is normal text.", "verse_1_1")
                .InsertPara("p")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

        XDocument expected = Usx(
            "PHM",
            Chapter("1"),
            Para("p", Verse("1"), Char("sup", "1"), Char("sup", "2"), Char("sup", "3"), " This is normal text.")
        );
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_Ref()
    {
        var chapterDelta = new ChapterDelta(
            1,
            1,
            true,
            Delta
                .New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("This is a verse with a footnote", "verse_1_1")
                .InsertNote(
                    Delta
                        .New()
                        .InsertChar("1.1: ", "fr", _testGuidService.Generate())
                        .InsertChar("Refers to ", "ft", _testGuidService.Generate())
                        .InsertChar("a footnote", "fq", _testGuidService.Generate())
                        .Insert(". ")
                        .InsertCharRef("John 1:1", "xt", "JHN 1:1", _testGuidService.Generate())
                        .Insert(" and ")
                        .InsertCharRef("Mark 1:1", "xt", "MRK 1:1", _testGuidService.Generate())
                        .Insert("."),
                    "f",
                    "+",
                    "verse_1_1"
                )
                .InsertText(", so that we can test it.", "verse_1_1")
                .InsertPara("p")
                .Insert("\n")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

        XDocument expected = Usx(
            "PHM",
            Chapter("1"),
            Para(
                "p",
                Verse("1"),
                "This is a verse with a footnote",
                Note(
                    "f",
                    "+",
                    Char("fr", "1.1: "),
                    Char("ft", "Refers to "),
                    Char("fq", "a footnote"),
                    ". ",
                    Char("xt", Ref("JHN 1:1", "John 1:1")),
                    " and ",
                    Char("xt", Ref("MRK 1:1", "Mark 1:1")),
                    "."
                ),
                ", so that we can test it."
            )
        );
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_EmptyRef()
    {
        var chapterDelta = new ChapterDelta(
            1,
            1,
            true,
            Delta
                .New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("This is a verse with a footnote", "verse_1_1")
                .InsertNote(
                    Delta
                        .New()
                        .InsertChar("1:1", "fr", _testGuidService.Generate())
                        .InsertEmptyChar("ft", _testGuidService.Generate())
                        .Insert(". ")
                        .InsertEmptyChar("xo", _testGuidService.Generate())
                        .InsertCharRef("Mark 1:1", "xt", "MRK 1:1", _testGuidService.Generate()),
                    "f",
                    "*",
                    "verse_1_1"
                )
                .InsertText(", so that we can test it.", "verse_1_1")
                .InsertPara("p")
                .Insert("\n")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

        XDocument expected = Usx(
            "PHM",
            Chapter("1"),
            Para(
                "p",
                Verse("1"),
                "This is a verse with a footnote",
                Note(
                    "f",
                    "*",
                    Char("fr", "1:1"),
                    Char("ft", null),
                    ". ",
                    Char("xo", null),
                    Char("xt", Ref("MRK 1:1", "Mark 1:1"))
                ),
                ", so that we can test it."
            )
        );
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_OptBreak()
    {
        var chapterDelta = new ChapterDelta(
            1,
            1,
            true,
            Delta
                .New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("This is a verse with a line break", "verse_1_1")
                .InsertOptBreak("verse_1_1")
                .InsertText(", so that we can test it.", "verse_1_1")
                .InsertPara("p")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

        XDocument expected = Usx(
            "PHM",
            Chapter("1"),
            Para("p", Verse("1"), "This is a verse with a line break", OptBreak(), ", so that we can test it.")
        );
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_Milestone()
    {
        var chapterDelta = new ChapterDelta(
            1,
            1,
            true,
            Delta
                .New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("This is a verse with a milestone", "verse_1_1")
                .InsertMilestone("ts", "verse_1_1")
                .InsertText(", so that we can test it.", "verse_1_1")
                .InsertPara("p")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

        XDocument expected = Usx(
            "PHM",
            Chapter("1"),
            Para("p", Verse("1"), "This is a verse with a milestone", Milestone("ts"), ", so that we can test it.")
        );
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_TableAtEnd()
    {
        var chapterDelta = new ChapterDelta(
            1,
            3,
            true,
            Delta
                .New()
                .InsertChapter("1")
                .InsertText("Before verse.", "cell_1_1_1")
                .InsertVerse("1")
                .InsertText("This is verse ", "verse_1_1")
                .InsertChar("1", "it", _testGuidService.Generate(), "verse_1_1")
                .InsertText(".", "verse_1_1")
                .InsertCell(1, 1, "tc1", "start")
                .InsertBlank("cell_1_1_2")
                .InsertVerse("2")
                .InsertText("This is verse 2.", "verse_1_2")
                .InsertCell(1, 1, "tc2", "start")
                .InsertBlank("cell_1_2_1")
                .InsertCell(1, 2, "tc1", "start")
                .InsertBlank("cell_1_2_2")
                .InsertVerse("3")
                .InsertText("This is verse 3.", "verse_1_3")
                .InsertCell(1, 2, "tc2", "start")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

        XDocument expected = Usx(
            "PHM",
            Chapter("1"),
            Table(
                Row(
                    Cell("tc1", "start", "Before verse.", Verse("1"), "This is verse ", Char("it", "1"), "."),
                    Cell("tc2", "start", Verse("2"), "This is verse 2.")
                ),
                Row(Cell("tc1", "start"), Cell("tc2", "start", Verse("3"), "This is verse 3."))
            )
        );
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_TableInMiddle()
    {
        var chapterDelta = new ChapterDelta(
            1,
            4,
            true,
            Delta
                .New()
                .InsertChapter("1")
                // Table 1 begins
                // Row 1 begins
                // Cell 1 begins
                .InsertText("Before verse.", "cell_1_1_1")
                .InsertVerse("1")
                .InsertText("This is verse ", "verse_1_1")
                .InsertChar("1", "it", _testGuidService.Generate(), "verse_1_1")
                .InsertText(".", "verse_1_1")
                .InsertCell(1, 1, "tc1", "start")
                // Cell 2 begins
                .InsertBlank("cell_1_1_2")
                .InsertVerse("2")
                .InsertText("This is verse 2.", "verse_1_2")
                .InsertCell(1, 1, "tc2", "start")
                // Row 2 begins
                // Cell 1 begins
                .InsertBlank("cell_1_2_1")
                .InsertCell(1, 2, "tc1", "start")
                // Cell 2 begins
                .InsertBlank("cell_1_2_2")
                .InsertVerse("3")
                .InsertText("This is verse 3.", "verse_1_3")
                .InsertCell(1, 2, "tc2", "start")
                // Post-table content
                .InsertBlank("p_1")
                .InsertVerse("4")
                .InsertText("This is verse 4.", "verse_1_4")
                .InsertPara("p")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

        XDocument expected = Usx(
            "PHM",
            Chapter("1"),
            Table(
                Row(
                    Cell("tc1", "start", "Before verse.", Verse("1"), "This is verse ", Char("it", "1"), "."),
                    Cell("tc2", "start", Verse("2"), "This is verse 2.")
                ),
                Row(Cell("tc1", "start"), Cell("tc2", "start", Verse("3"), "This is verse 3."))
            ),
            Para("p", Verse("4"), "This is verse 4.")
        );
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));

        // And we should be able to roundtrip it back.
        List<ChapterDelta> roundtrippedChapterDeltas = [.. mapper.ToChapterDeltas(newUsxDoc)];
        Assert.IsTrue(roundtrippedChapterDeltas[0].Delta.DeepEquals(chapterDelta.Delta));
    }

    [Test]
    public void ToUsx_AdjacentTables()
    {
        var chapterDelta = new ChapterDelta(
            1,
            8,
            true,
            Delta
                .New()
                .InsertChapter("1")
                .InsertBlank("cell_1_1_1")
                .InsertVerse("1")
                .InsertText("This is verse 1.", "verse_1_1")
                .InsertCell(1, 1, "tc1", "start")
                .InsertBlank("cell_1_1_2")
                .InsertVerse("2")
                .InsertText("This is verse 2.", "verse_1_2")
                .InsertCell(1, 1, "tc2", "start")
                .InsertBlank("cell_1_2_1")
                .InsertVerse("3")
                .InsertText("This is verse 3.", "verse_1_3")
                .InsertCell(1, 2, "tc1", "start")
                .InsertBlank("cell_1_2_2")
                .InsertVerse("4")
                .InsertText("This is verse 4.", "verse_1_4")
                .InsertCell(1, 2, "tc2", "start")
                .InsertBlank("cell_2_1_1")
                .InsertVerse("5")
                .InsertText("This is verse 5.", "verse_1_5")
                .InsertCell(2, 1, "tc1", "start")
                .InsertBlank("cell_2_1_2")
                .InsertVerse("6")
                .InsertText("This is verse 6.", "verse_1_6")
                .InsertCell(2, 1, "tc2", "start")
                .InsertBlank("cell_2_2_1")
                .InsertVerse("7")
                .InsertText("This is verse 7.", "verse_1_7")
                .InsertCell(2, 2, "tc1", "start")
                .InsertBlank("cell_2_2_2")
                .InsertVerse("8")
                .InsertText("This is verse 8.", "verse_1_8")
                .InsertCell(2, 2, "tc2", "start")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

        XDocument expected = Usx(
            "PHM",
            Chapter("1"),
            Table(
                Row(
                    Cell("tc1", "start", Verse("1"), "This is verse 1."),
                    Cell("tc2", "start", Verse("2"), "This is verse 2.")
                ),
                Row(
                    Cell("tc1", "start", Verse("3"), "This is verse 3."),
                    Cell("tc2", "start", Verse("4"), "This is verse 4.")
                )
            ),
            Table(
                Row(
                    Cell("tc1", "start", Verse("5"), "This is verse 5."),
                    Cell("tc2", "start", Verse("6"), "This is verse 6.")
                ),
                Row(
                    Cell("tc1", "start", Verse("7"), "This is verse 7."),
                    Cell("tc2", "start", Verse("8"), "This is verse 8.")
                )
            )
        );
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_CollapsesAdjacentNewlines()
    {
        // Suppose there are multiple newlines in a row.
        var chapterDeltaA = new ChapterDelta(
            1,
            1,
            true,
            Delta
                .New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("Verse text.", "verse_1_1")
                .InsertPara("p")
                .Insert("\n")
                .Insert("\n")
                .Insert("\n")
                .Insert("\n")
        );

        // Or suppose there are no newlines at the end.
        var chapterDeltaB = new ChapterDelta(
            1,
            1,
            true,
            Delta
                .New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("Verse text.", "verse_1_1")
                .InsertPara("p")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDocA = mapper.ToUsx(Usx("PHM"), new[] { chapterDeltaA });
        XDocument newUsxDocB = mapper.ToUsx(Usx("PHM"), new[] { chapterDeltaB });

        XDocument expected = Usx("PHM", Chapter("1"), Para("p", Verse("1"), "Verse text."));
        // The implied paragraphs are combined.
        Assert.IsTrue(XNode.DeepEquals(newUsxDocA, expected));
        Assert.IsTrue(XNode.DeepEquals(newUsxDocB, expected));
    }

    [Test]
    public void ToUsx_ConsecutiveSameStyleEmptyParas()
    {
        var chapterDelta = new ChapterDelta(
            1,
            0,
            true,
            Delta.New().InsertBlank("p_1").InsertPara("p").InsertBlank("p_2").InsertPara("p")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

        XDocument expected = Usx("PHM", Para("p"), Para("p"));
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_NoParagraphs()
    {
        var chapterDeltas = new[]
        {
            new ChapterDelta(
                1,
                3,
                true,
                Delta
                    .New()
                    .InsertChapter("1")
                    .InsertVerse("1")
                    .InsertText("This is verse 1.", "verse_1_1")
                    .InsertVerse("2")
                    .InsertBlank("verse_1_2")
                    .InsertVerse("3")
                    .InsertText("This is verse 3.", "verse_1_3")
                    .Insert("\n")
            ),
            new ChapterDelta(
                2,
                2,
                true,
                Delta
                    .New()
                    .InsertChapter("2")
                    .InsertVerse("1")
                    .InsertBlank("verse_2_1")
                    .InsertVerse("2")
                    .InsertBlank("verse_2_2")
                    .Insert("\n")
            ),
        };

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(Usx("PHM", Chapter("1"), "Text", Chapter("2"), "Text"), chapterDeltas);

        XDocument expected = Usx(
            "PHM",
            Chapter("1"),
            Verse("1"),
            "This is verse 1.",
            Verse("2"),
            Verse("3"),
            "This is verse 3.",
            Chapter("2"),
            Verse("1"),
            Verse("2")
        );
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));

        // And we should be able to roundtrip it back.
        List<ChapterDelta> roundtrippedChapterDeltas = [.. mapper.ToChapterDeltas(newUsxDoc)];
        Assert.IsTrue(roundtrippedChapterDeltas[0].Delta.DeepEquals(chapterDeltas[0].Delta));
        Assert.IsTrue(roundtrippedChapterDeltas[1].Delta.DeepEquals(chapterDeltas[1].Delta));
    }

    [Test]
    public void ToUsx_ImpliedParagraph()
    {
        var chapterDelta = new ChapterDelta(
            1,
            1,
            true,
            Delta
                .New()
                .InsertChapter("1")
                .Insert("This is an implied paragraph before the first verse.")
                .Insert("\n")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertBlank("verse_1_1")
                .InsertPara("p")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

        XDocument expected = Usx(
            "PHM",
            Chapter("1"),
            "This is an implied paragraph before the first verse.",
            Para("p", Verse("1"))
        );
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_ImpliedParagraphTwice()
    {
        var chapterDelta = new ChapterDelta(
            1,
            1,
            true,
            Delta
                .New()
                .InsertChapter("1")
                .Insert("This is an implied paragraph before the first verse.")
                .Insert("\n")
                .Insert(" This is actually part of the first implied paragraph.")
                .Insert("\n")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertBlank("verse_1_1")
                .InsertPara("p")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

        XDocument expected = Usx(
            "PHM",
            Chapter("1"),
            "This is an implied paragraph before the first verse.",
            " This is actually part of the first implied paragraph.",
            Para("p", Verse("1"))
        );
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_ImpliedParagraphInVerse()
    {
        var chapterDelta = new ChapterDelta(
            1,
            1,
            true,
            Delta
                .New()
                .InsertChapter("1")
                .Insert("This is an implied paragraph before the first verse.")
                .Insert("\n")
                .InsertText("This is actually an implied paragraph as part of the verse.", "p_1")
                .InsertVerse("1")
                .InsertBlank("verse_1_1")
                .InsertPara("p")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

        XDocument expected = Usx(
            "PHM",
            Chapter("1"),
            "This is an implied paragraph before the first verse.",
            Para("p", "This is actually an implied paragraph as part of the verse.", Verse("1"))
        );
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_NoParagraphsImpliedParagraph()
    {
        var chapterDeltas = new[]
        {
            new ChapterDelta(
                1,
                3,
                true,
                Delta
                    .New()
                    .InsertChapter("1")
                    .Insert("This is an implied paragraph before the first verse.")
                    .InsertVerse("1")
                    .InsertText("This is verse 1.", "verse_1_1")
                    .InsertVerse("2")
                    .InsertBlank("verse_1_2")
                    .InsertVerse("3")
                    .InsertText("This is verse 3.", "verse_1_3")
                    .Insert("\n")
            ),
            new ChapterDelta(
                2,
                2,
                true,
                Delta
                    .New()
                    .InsertChapter("2")
                    .InsertVerse("1")
                    .InsertBlank("verse_2_1")
                    .InsertVerse("2")
                    .InsertBlank("verse_2_2")
                    .Insert("\n")
            ),
        };

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(Usx("PHM", Chapter("1"), "Text", Chapter("2"), "Text"), chapterDeltas);

        XDocument expected = Usx(
            "PHM",
            Chapter("1"),
            "This is an implied paragraph before the first verse.",
            Verse("1"),
            "This is verse 1.",
            Verse("2"),
            Verse("3"),
            "This is verse 3.",
            Chapter("2"),
            Verse("1"),
            Verse("2")
        );
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_EmptyBook()
    {
        var chapterDeltas = new[] { new ChapterDelta(1, 0, true, new Delta()) };

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), chapterDeltas);

        XDocument expected = Usx("PHM");
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_MismatchNoChapters_UnchangedUsx()
    {
        _exceptionHandler.ClearReceivedCalls();
        var chapterDeltas = new[] { new ChapterDelta(1, 0, true, new Delta()) };

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);

        // The USX here has chapters that are not in ChapterDeltas. The chapterDeltas contains
        // the 1 implicit 'chapter'.
        XDocument input = Usx(
            "PHM",
            Chapter("1"),
            Para("p", Verse("1"), "Verse text."),
            Chapter("2"),
            Para("p", Verse("1"), "Verse text.")
        );

        // SUT
        XDocument newUsxDoc = mapper.ToUsx(input, chapterDeltas);

        XDocument expected = input;
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
        _exceptionHandler
            .Received()
            .ReportException(Arg.Is<Exception>((Exception e) => e.Message.Contains("no real chapters")));
    }

    [Test]
    public void ToUsx_NewChapter_Added()
    {
        var chapterDeltas = new[]
        {
            new ChapterDelta(
                1,
                2,
                true,
                Delta
                    .New()
                    .InsertChapter("1")
                    .InsertVerse("1")
                    .InsertText("This is verse 1.", "verse_1_1")
                    .InsertVerse("2")
                    .InsertText("This is verse 2.", "verse_1_2")
                    .InsertPara("p")
            ),
            new ChapterDelta(
                2,
                2,
                true,
                Delta
                    .New()
                    .InsertChapter("2")
                    .InsertVerse("1")
                    .InsertText("New chapter verse 1", "verse_2_1")
                    .InsertVerse("2")
                    .InsertText("New chapter verse 2", "verse_2_2")
                    .InsertPara("p")
            ),
        };

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);

        XDocument expected = Usx(
            "PHM",
            Chapter("1"),
            Para("p", Verse("1"), "This is verse 1.", Verse("2"), "This is verse 2."),
            Chapter("2"),
            Para("p", Verse("1"), "New chapter verse 1", Verse("2"), "New chapter verse 2")
        );

        // SUT
        XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), chapterDeltas);
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_NewChapter_AddedBetweenChapters()
    {
        var chapterDeltas = new[]
        {
            new ChapterDelta(
                1,
                2,
                true,
                Delta
                    .New()
                    .InsertChapter("1")
                    .InsertVerse("1")
                    .InsertText("This is verse 1.", "verse_1_1")
                    .InsertVerse("2")
                    .InsertText("This is verse 2.", "verse_1_2")
                    .InsertPara("p")
            ),
            new ChapterDelta(
                2,
                2,
                true,
                Delta
                    .New()
                    .InsertChapter("2")
                    .InsertVerse("1")
                    .InsertText("New chapter verse 1.", "verse_2_1")
                    .InsertVerse("2")
                    .InsertText("New chapter verse 2.", "verse_2_2")
                    .InsertPara("p")
            ),
            new ChapterDelta(
                3,
                2,
                true,
                Delta
                    .New()
                    .InsertChapter("3")
                    .InsertVerse("1")
                    .InsertText("This is verse 1.", "verse_3_1")
                    .InsertVerse("2")
                    .InsertText("This is verse 2.", "verse_3_2")
                    .InsertPara("p")
            ),
        };

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);

        XDocument original = Usx(
            "PHM",
            Chapter("1"),
            Para("p", Verse("1"), "This is verse 1.", Verse("2"), "This is verse 2."),
            Chapter("3"),
            Para("p", Verse("1"), "This is verse 1.", Verse("2"), "This is verse 2.")
        );

        XDocument expected = Usx(
            "PHM",
            Chapter("1"),
            Para("p", Verse("1"), "This is verse 1.", Verse("2"), "This is verse 2."),
            Chapter("2"),
            Para("p", Verse("1"), "New chapter verse 1.", Verse("2"), "New chapter verse 2."),
            Chapter("3"),
            Para("p", Verse("1"), "This is verse 1.", Verse("2"), "This is verse 2.")
        );

        // SUT
        XDocument newUsxDoc = mapper.ToUsx(original, chapterDeltas);
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_FirstChapterMissing()
    {
        var chapterDeltas = new[]
        {
            new ChapterDelta(
                2,
                2,
                true,
                Delta
                    .New()
                    .InsertText("Introductory material")
                    .InsertPara("toc1")
                    .InsertChapter("2")
                    .InsertVerse("1")
                    .InsertText("This is verse 1 (edited).", "verse_2_1")
                    .InsertVerse("2")
                    .InsertText("This is verse 2 (edited).", "verse_2_2")
                    .InsertPara("p")
            ),
        };

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);

        XDocument original = Usx(
            "PHM",
            Para("toc1", "Introductory material"),
            Chapter("2"),
            Para("p", Verse("1"), "This is verse 1.", Verse("2"), "This is verse 2.")
        );

        XDocument expected = Usx(
            "PHM",
            Para("toc1", "Introductory material"),
            Chapter("2"),
            Para("p", Verse("1"), "This is verse 1 (edited).", Verse("2"), "This is verse 2 (edited).")
        );

        // SUT
        XDocument newUsxDoc = mapper.ToUsx(original, chapterDeltas);
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_BlankLine()
    {
        var chapterDelta = new ChapterDelta(
            1,
            3,
            true,
            Delta
                .New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertBlank("verse_1_1")
                .InsertVerse("2")
                .InsertBlank("verse_1_2")
                .InsertPara("p")
                .InsertPara("b")
                .InsertBlank("p_2")
                .InsertVerse("3")
                .InsertBlank("verse_1_3")
                .InsertPara("p")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

        XDocument expected = Usx(
            "PHM",
            Chapter("1"),
            Para("p", Verse("1"), Verse("2")),
            Para("b"),
            Para("p", Verse("3"))
        );
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_MultipleBookElements()
    {
        var chapterDelta = new ChapterDelta(
            1,
            1,
            true,
            Delta
                .New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("Verse text.", "verse_1_1")
                .InsertPara("p")
                .Insert("\n")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(Usx("XXA", Book("PHM"), Chapter("1")), new[] { chapterDelta });

        XDocument expected = Usx("XXA", Book("PHM"), Chapter("1"), Para("p", Verse("1"), "Verse text."));
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_InvalidParaInFirstChapter()
    {
        var chapterDeltas = new[]
        {
            new ChapterDelta(
                1,
                1,
                false,
                Delta
                    .New()
                    .InsertText("Book title", "imt_1")
                    .InsertPara("imt")
                    .InsertChapter("1")
                    .InsertBlank("bad_1")
                    .InsertVerse("1")
                    .InsertText("New verse text.", "verse_1_1")
                    .InsertPara("bad", true)
            ),
            new ChapterDelta(
                2,
                1,
                true,
                Delta
                    .New()
                    .InsertChapter("2")
                    .InsertBlank("p_1")
                    .InsertVerse("1")
                    .InsertText("New verse text.", "verse_2_1")
                    .InsertPara("p")
            ),
            new ChapterDelta(
                3,
                1,
                true,
                Delta
                    .New()
                    .InsertChapter("3")
                    .InsertBlank("p_1")
                    .InsertVerse("1")
                    .InsertText("New verse text.", "verse_3_1")
                    .InsertPara("p")
            ),
        };

        var oldUsxDoc = Usx(
            "PHM",
            Para("imt", "Book title"),
            Chapter("1"),
            Para("bad", Verse("1"), "Old verse text."),
            Chapter("2"),
            Para("p", Verse("1"), "Old verse text."),
            Chapter("3"),
            Para("p", Verse("1"), "Old verse text.")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(oldUsxDoc, chapterDeltas);

        XDocument expected = Usx(
            "PHM",
            Para("imt", "Book title"),
            Chapter("1"),
            Para("bad", Verse("1"), "Old verse text."),
            Chapter("2"),
            Para("p", Verse("1"), "New verse text."),
            Chapter("3"),
            Para("p", Verse("1"), "New verse text.")
        );
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_InvalidParaInMiddleChapter()
    {
        var chapterDeltas = new[]
        {
            new ChapterDelta(
                1,
                1,
                true,
                Delta
                    .New()
                    .InsertText("Book title", "imt_1")
                    .InsertPara("imt")
                    .InsertChapter("1")
                    .InsertBlank("p_1")
                    .InsertVerse("1")
                    .InsertText("New verse text.", "verse_1_1")
                    .InsertPara("p")
            ),
            new ChapterDelta(
                2,
                1,
                false,
                Delta
                    .New()
                    .InsertChapter("2")
                    .InsertBlank("bad_1")
                    .InsertVerse("1")
                    .InsertText("New verse text.", "verse_2_1")
                    .InsertPara("bad", true)
            ),
            new ChapterDelta(
                3,
                1,
                true,
                Delta
                    .New()
                    .InsertChapter("3")
                    .InsertBlank("p_1")
                    .InsertVerse("1")
                    .InsertText("New verse text.", "verse_3_1")
                    .InsertPara("p")
            ),
        };

        var oldUsxDoc = Usx(
            "PHM",
            Para("imt", "Book title"),
            Chapter("1"),
            Para("p", Verse("1"), "Old verse text."),
            Chapter("2"),
            Para("bad", Verse("1"), "Old verse text."),
            Chapter("3"),
            Para("p", Verse("1"), "Old verse text.")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(oldUsxDoc, chapterDeltas);

        XDocument expected = Usx(
            "PHM",
            Para("imt", "Book title"),
            Chapter("1"),
            Para("p", Verse("1"), "New verse text."),
            Chapter("2"),
            Para("bad", Verse("1"), "Old verse text."),
            Chapter("3"),
            Para("p", Verse("1"), "New verse text.")
        );
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_InvalidParaInLastChapter()
    {
        var chapterDeltas = new[]
        {
            new ChapterDelta(
                1,
                1,
                true,
                Delta
                    .New()
                    .InsertText("Book title", "imt_1")
                    .InsertPara("imt")
                    .InsertChapter("1")
                    .InsertBlank("p_1")
                    .InsertVerse("1")
                    .InsertText("New verse text.", "verse_1_1")
                    .InsertPara("p")
            ),
            new ChapterDelta(
                2,
                1,
                true,
                Delta
                    .New()
                    .InsertChapter("2")
                    .InsertBlank("p_1")
                    .InsertVerse("1")
                    .InsertText("New verse text.", "verse_2_1")
                    .InsertPara("p")
            ),
            new ChapterDelta(
                3,
                1,
                false,
                Delta
                    .New()
                    .InsertChapter("3")
                    .InsertBlank("bad_1")
                    .InsertVerse("1")
                    .InsertText("New verse text.", "verse_3_1")
                    .InsertPara("bad", true)
            ),
        };

        var oldUsxDoc = Usx(
            "PHM",
            Para("imt", "Book title"),
            Chapter("1"),
            Para("p", Verse("1"), "Old verse text."),
            Chapter("2"),
            Para("p", Verse("1"), "Old verse text."),
            Chapter("3"),
            Para("bad", Verse("1"), "Old verse text.")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(oldUsxDoc, chapterDeltas);

        XDocument expected = Usx(
            "PHM",
            Para("imt", "Book title"),
            Chapter("1"),
            Para("p", Verse("1"), "New verse text."),
            Chapter("2"),
            Para("p", Verse("1"), "New verse text."),
            Chapter("3"),
            Para("bad", Verse("1"), "Old verse text.")
        );
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_Unmatched()
    {
        var chapterDelta = new ChapterDelta(
            1,
            1,
            true,
            Delta
                .New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("This is a verse with an unmatched marker", "verse_1_1")
                .InsertEmbed("unmatched", new JObject(new JProperty("marker", "bad")), "verse_1_1")
                .InsertPara("p")
                .Insert("\n")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

        XDocument expected = Usx(
            "PHM",
            Chapter("1"),
            Para("p", Verse("1"), "This is a verse with an unmatched marker", Unmatched("bad"))
        );
        Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
    }

    [Test]
    public void ToUsx_InvalidChapterNumber()
    {
        var chapterDelta = new ChapterDelta(
            2,
            2,
            true,
            Delta
                .New()
                .InsertChapter("2")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertBlank("verse_2_1")
                .InsertVerse("2")
                .InsertBlank("verse_2_2")
                .InsertPara("p")
        );

        XDocument oldUsxDoc = Usx("PHM", Chapter("bad"), Para("p", Verse("1"), Verse("2")), Chapter("2"));

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        Assert.Throws<InvalidDataException>(() => mapper.ToUsx(oldUsxDoc, new[] { chapterDelta }));
    }

    [Test]
    public void ToDelta_EmptySegments()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            Para("p", Verse("1"), Verse("2")),
            Para("li"),
            Para("li"),
            Para("p", Verse("3"))
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertBlank("verse_1_1")
            .InsertVerse("2")
            .InsertBlank("verse_1_2")
            .InsertPara("p")
            .InsertBlank("verse_1_2/li_1")
            .InsertPara("li")
            .InsertBlank("verse_1_2/li_2")
            .InsertPara("li")
            .InsertBlank("verse_1_2/p_3")
            .InsertVerse("3")
            .InsertBlank("verse_1_3")
            .InsertPara("p");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(3));
        Assert.That(chapterDeltas[0].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_InvalidChapterNumber()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("bad"),
            Para("p", Verse("1"), Verse("2")),
            Chapter("2"),
            Para("p", Verse("1"), Verse("2"))
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = Delta
            .New()
            .InsertChapter("2")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertBlank("verse_2_1")
            .InsertVerse("2")
            .InsertBlank("verse_2_2")
            .InsertPara("p");

        Assert.That(chapterDeltas.Count, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].Number, Is.EqualTo(2));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(2));
        Assert.That(chapterDeltas[0].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_InvalidChapter()
    {
        XDocument usxDoc = Usx("PHM", Chapter("1", "bad"), Para("p", Verse("1"), Verse("2")));

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = Delta
            .New()
            .InsertChapter("1", "bad", true)
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertBlank("verse_1_1")
            .InsertVerse("2")
            .InsertBlank("verse_1_2")
            .InsertPara("p");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(2));
        Assert.That(chapterDeltas[0].IsValid, Is.False);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_InvalidVerse()
    {
        XDocument usxDoc = Usx("PHM", Chapter("1"), Para("p", Verse("1", "bad"), Verse("2")));

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertBlank("p_1")
            .InsertVerse("1", "bad", true)
            .InsertBlank("verse_1_1")
            .InsertVerse("2")
            .InsertBlank("verse_1_2")
            .InsertPara("p");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(2));
        Assert.That(chapterDeltas[0].IsValid, Is.False);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_DoublyInvalidInline()
    {
        // A node that is invalid for more than one reason is still just invalid, not crashing.

        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            Para("p", Verse("1"), Char("tei", Char("ver", "blah")), Verse("2"))
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertChar(
                "blah",
                new List<CharAttr>
                {
                    new CharAttr { Style = "tei", CharID = _testGuidService.Generate() },
                    new CharAttr { Style = "ver", CharID = _testGuidService.Generate() },
                },
                "verse_1_1",
                invalid: true
            )
            .InsertVerse("2")
            .InsertBlank("verse_1_2")
            .InsertPara("p");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(2));
        Assert.That(chapterDeltas[0].IsValid, Is.False);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_InvalidLastVerse()
    {
        XDocument usxDoc = Usx("PHM", Chapter("1"), Para("p", Verse("1"), Verse("2bad")));

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertBlank("verse_1_1")
            .InsertVerse("2bad", "v", true)
            .InsertBlank("verse_1_2bad")
            .InsertPara("p");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].IsValid, Is.False);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_SectionHeader()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Para("mt", "Philemon"),
            Chapter("1"),
            Para("p", Verse("1"), Verse("2")),
            Para("s"),
            Para("p", Verse("3")),
            Chapter("2"),
            Para("p", Verse("1"), Verse("2")),
            Para("s"),
            Para("p", Verse("3"))
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expectedChapter1 = Delta
            .New()
            .InsertText("Philemon", "mt_1")
            .InsertPara("mt")
            .InsertChapter("1")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertBlank("verse_1_1")
            .InsertVerse("2")
            .InsertBlank("verse_1_2")
            .InsertPara("p")
            .InsertBlank("s_1")
            .InsertPara("s")
            .InsertBlank("p_2")
            .InsertVerse("3")
            .InsertBlank("verse_1_3")
            .InsertPara("p");

        var expectedChapter2 = Delta
            .New()
            .InsertChapter("2")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertBlank("verse_2_1")
            .InsertVerse("2")
            .InsertBlank("verse_2_2")
            .InsertPara("p")
            .InsertBlank("s_1")
            .InsertPara("s")
            .InsertBlank("p_2")
            .InsertVerse("3")
            .InsertBlank("verse_2_3")
            .InsertPara("p");

        Assert.That(chapterDeltas.Count, Is.EqualTo(2));
        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(3));
        Assert.That(chapterDeltas[0].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expectedChapter1));
        Assert.That(chapterDeltas[1].Number, Is.EqualTo(2));
        Assert.That(chapterDeltas[1].LastVerse, Is.EqualTo(3));
        Assert.That(chapterDeltas[1].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[1].Delta.DeepEquals(expectedChapter2));
    }

    [Test]
    public void ToDelta_Note()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            Para(
                "p",
                Verse("1"),
                "This is a verse with a footnote",
                Note(
                    "f",
                    "+",
                    Char("fr", "1.1: "),
                    Char("ft", "Refers to "),
                    Char("fq", "a footnote"),
                    ". ",
                    Char("xt", "John 1:1"),
                    " and ",
                    Char("xt", "Mark 1:1")
                ),
                ", so that we can test it."
            )
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertText("This is a verse with a footnote", "verse_1_1")
            .InsertNote(
                Delta
                    .New()
                    .InsertChar("1.1: ", "fr", _testGuidService.Generate())
                    .InsertChar("Refers to ", "ft", _testGuidService.Generate())
                    .InsertChar("a footnote", "fq", _testGuidService.Generate())
                    .Insert(". ")
                    .InsertChar("John 1:1", "xt", _testGuidService.Generate())
                    .Insert(" and ")
                    .InsertChar("Mark 1:1", "xt", _testGuidService.Generate()),
                "f",
                "+",
                "verse_1_1"
            )
            .InsertText(", so that we can test it.", "verse_1_1")
            .InsertPara("p");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_InvalidNote()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            Para(
                "p",
                Verse("1"),
                "This is a verse with a footnote",
                Note(
                    "bad",
                    "+",
                    Char("fr", "1.1: "),
                    Char("ft", "Refers to "),
                    Char("fq", "a footnote"),
                    ". ",
                    Char("xt", "John 1:1"),
                    " and ",
                    Char("xt", "Mark 1:1")
                ),
                ", so that we can test it."
            )
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertText("This is a verse with a footnote", "verse_1_1")
            .InsertNote(
                Delta
                    .New()
                    .InsertChar("1.1: ", "fr", _testGuidService.Generate())
                    .InsertChar("Refers to ", "ft", _testGuidService.Generate())
                    .InsertChar("a footnote", "fq", _testGuidService.Generate())
                    .Insert(". ")
                    .InsertChar("John 1:1", "xt", _testGuidService.Generate())
                    .Insert(" and ")
                    .InsertChar("Mark 1:1", "xt", _testGuidService.Generate()),
                "bad",
                "+",
                "verse_1_1",
                true
            )
            .InsertText(", so that we can test it.", "verse_1_1")
            .InsertPara("p");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].IsValid, Is.False);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_Note_InvalidContent()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            Para(
                "p",
                Verse("1"),
                "This is a verse with a footnote",
                Note(
                    "f",
                    "+",
                    Char("bad", "1.1: "),
                    Char("ft", "Refers to "),
                    Char("fq", "a footnote"),
                    ". ",
                    Char("xt", "John 1:1"),
                    " and ",
                    Char("xt", "Mark 1:1")
                ),
                ", so that we can test it."
            )
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertText("This is a verse with a footnote", "verse_1_1")
            .InsertNote(
                Delta
                    .New()
                    .InsertChar("1.1: ", "bad", _testGuidService.Generate(), invalid: true)
                    .InsertChar("Refers to ", "ft", _testGuidService.Generate())
                    .InsertChar("a footnote", "fq", _testGuidService.Generate())
                    .Insert(". ")
                    .InsertChar("John 1:1", "xt", _testGuidService.Generate())
                    .Insert(" and ")
                    .InsertChar("Mark 1:1", "xt", _testGuidService.Generate()),
                "f",
                "+",
                "verse_1_1"
            )
            .InsertText(", so that we can test it.", "verse_1_1")
            .InsertPara("p");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].IsValid, Is.False);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_Figure()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            Para(
                "p",
                Verse("1"),
                "This is a verse with a figure",
                Figure("file.jpg", "col", "PHM 1:1", "Caption"),
                ", so that we can test it."
            )
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertText("This is a verse with a figure", "verse_1_1")
            .InsertFigure("file.jpg", "col", "PHM 1:1", "Caption", "verse_1_1")
            .InsertText(", so that we can test it.", "verse_1_1")
            .InsertPara("p");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_InvalidFigure()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            Para(
                "p",
                Verse("1"),
                "This is a verse with a figure",
                Figure("file.jpg", "col", null, "Caption"),
                ", so that we can test it."
            )
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertText("This is a verse with a figure", "verse_1_1")
            .InsertFigure("file.jpg", "col", null, "Caption", "verse_1_1", true)
            .InsertText(", so that we can test it.", "verse_1_1")
            .InsertPara("p");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].IsValid, Is.False);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_CharText()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            Para("p", Verse("1"), "This is some ", Char("bd", "bold"), " text.")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertText("This is some ", "verse_1_1")
            .InsertChar("bold", "bd", _testGuidService.Generate(), "verse_1_1")
            .InsertText(" text.", "verse_1_1")
            .InsertPara("p");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_EmptyChar()
    {
        XDocument usxDoc = Usx("PHM", Chapter("1"), Para("p", Verse("1"), "This is some ", Char("bd", ""), " text."));

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertText("This is some ", "verse_1_1")
            .InsertEmptyChar("bd", _testGuidService.Generate(), "verse_1_1")
            .InsertText(" text.", "verse_1_1")
            .InsertPara("p");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_NestedChars()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            Para(
                "p",
                Verse("1"),
                Char("bd", Char("sup", "1"), "This is", Char("sup", "2"), " bold text.", Char("sup", "3")),
                " This is normal text."
            )
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        string bdCharID = _testGuidService.Generate();
        string sup1CharID = _testGuidService.Generate();
        string sup2CharID = _testGuidService.Generate();
        string sup3CharID = _testGuidService.Generate();
        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertChar(
                "1",
                new List<CharAttr>
                {
                    new CharAttr { Style = "bd", CharID = bdCharID },
                    new CharAttr { Style = "sup", CharID = sup1CharID },
                },
                "verse_1_1"
            )
            .InsertChar("This is", "bd", bdCharID, "verse_1_1")
            .InsertChar(
                "2",
                new List<CharAttr>
                {
                    new CharAttr { Style = "bd", CharID = bdCharID },
                    new CharAttr { Style = "sup", CharID = sup2CharID },
                },
                "verse_1_1"
            )
            .InsertChar(" bold text.", "bd", bdCharID, "verse_1_1")
            .InsertChar(
                "3",
                new List<CharAttr>
                {
                    new CharAttr { Style = "bd", CharID = bdCharID },
                    new CharAttr { Style = "sup", CharID = sup3CharID },
                },
                "verse_1_1"
            )
            .InsertText(" This is normal text.", "verse_1_1")
            .InsertPara("p");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_NestedAdjacentChars()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            Para(
                "p",
                Verse("1"),
                Char("bd", Char("sup", "1"), Char("sup", "2"), Char("sup", "3")),
                " This is normal text."
            )
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        string bdCharID = _testGuidService.Generate();
        string sup1CharID = _testGuidService.Generate();
        string sup2CharID = _testGuidService.Generate();
        string sup3CharID = _testGuidService.Generate();
        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertChar(
                "1",
                new List<CharAttr>
                {
                    new CharAttr { Style = "bd", CharID = bdCharID },
                    new CharAttr { Style = "sup", CharID = sup1CharID },
                },
                "verse_1_1"
            )
            .InsertChar(
                "2",
                new List<CharAttr>
                {
                    new CharAttr { Style = "bd", CharID = bdCharID },
                    new CharAttr { Style = "sup", CharID = sup2CharID },
                },
                "verse_1_1"
            )
            .InsertChar(
                "3",
                new List<CharAttr>
                {
                    new CharAttr { Style = "bd", CharID = bdCharID },
                    new CharAttr { Style = "sup", CharID = sup3CharID },
                },
                "verse_1_1"
            )
            .InsertText(" This is normal text.", "verse_1_1")
            .InsertPara("p");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_DoubleNestedAdjacentChars()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            Para(
                "p",
                Verse("1"),
                Char(
                    "bd",
                    Char("sup", "1"),
                    "This is bold text",
                    Char("no", " but this is not bold,", Char("sup", "2"), Char("sup", "3")),
                    " and this is bold.",
                    Char("sup", "4")
                ),
                " This is normal text."
            )
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        string bdCharID = _testGuidService.Generate();
        string sup1CharID = _testGuidService.Generate();
        string noCharID = _testGuidService.Generate();
        string sup2CharID = _testGuidService.Generate();
        string sup3CharID = _testGuidService.Generate();
        string sup4CharID = _testGuidService.Generate();
        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertChar(
                "1",
                new List<CharAttr>
                {
                    new CharAttr { Style = "bd", CharID = bdCharID },
                    new CharAttr { Style = "sup", CharID = sup1CharID },
                },
                "verse_1_1"
            )
            .InsertChar("This is bold text", "bd", bdCharID, "verse_1_1")
            .InsertChar(
                " but this is not bold,",
                new List<CharAttr>
                {
                    new CharAttr { Style = "bd", CharID = bdCharID },
                    new CharAttr { Style = "no", CharID = noCharID },
                },
                "verse_1_1"
            )
            .InsertChar(
                "2",
                new List<CharAttr>
                {
                    new CharAttr { Style = "bd", CharID = bdCharID },
                    new CharAttr { Style = "no", CharID = noCharID },
                    new CharAttr { Style = "sup", CharID = sup2CharID },
                },
                "verse_1_1"
            )
            .InsertChar(
                "3",
                new List<CharAttr>
                {
                    new CharAttr { Style = "bd", CharID = bdCharID },
                    new CharAttr { Style = "no", CharID = noCharID },
                    new CharAttr { Style = "sup", CharID = sup3CharID },
                },
                "verse_1_1"
            )
            .InsertChar(" and this is bold.", "bd", bdCharID, "verse_1_1")
            .InsertChar(
                "4",
                new List<CharAttr>
                {
                    new CharAttr { Style = "bd", CharID = bdCharID },
                    new CharAttr { Style = "sup", CharID = sup4CharID },
                },
                "verse_1_1"
            )
            .InsertText(" This is normal text.", "verse_1_1")
            .InsertPara("p");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_InvalidChars()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            Para(
                "p",
                Verse("1"),
                Char("bad", Char("sup", "1"), "This is", Char("sup", "2"), " bold text.", Char("sup", "3")),
                " This is normal text."
            )
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        string badCharID = _testGuidService.Generate();
        string sup1CharID = _testGuidService.Generate();
        string sup2CharID = _testGuidService.Generate();
        string sup3CharID = _testGuidService.Generate();
        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertChar(
                "1",
                new List<CharAttr>
                {
                    new CharAttr { Style = "bad", CharID = badCharID },
                    new CharAttr { Style = "sup", CharID = sup1CharID },
                },
                "verse_1_1",
                true
            )
            .InsertChar("This is", "bad", badCharID, "verse_1_1", true)
            .InsertChar(
                "2",
                new List<CharAttr>
                {
                    new CharAttr { Style = "bad", CharID = badCharID },
                    new CharAttr { Style = "sup", CharID = sup2CharID },
                },
                "verse_1_1",
                true
            )
            .InsertChar(" bold text.", "bad", badCharID, "verse_1_1", true)
            .InsertChar(
                "3",
                new List<CharAttr>
                {
                    new CharAttr { Style = "bad", CharID = badCharID },
                    new CharAttr { Style = "sup", CharID = sup3CharID },
                },
                "verse_1_1",
                true
            )
            .InsertText(" This is normal text.", "verse_1_1")
            .InsertPara("p");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].IsValid, Is.False);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_AdjacentChars()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            Para("p", Verse("1"), Char("sup", "1"), Char("sup", "2"), Char("sup", "3"), " This is normal text.")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertChar("1", "sup", _testGuidService.Generate(), "verse_1_1")
            .InsertChar("2", "sup", _testGuidService.Generate(), "verse_1_1")
            .InsertChar("3", "sup", _testGuidService.Generate(), "verse_1_1")
            .InsertText(" This is normal text.", "verse_1_1")
            .InsertPara("p");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_Ref()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            Para(
                "p",
                Verse("1"),
                "This is a verse with a footnote",
                Note(
                    "f",
                    "+",
                    Char("fr", "1.1: "),
                    Char("ft", "Refers to "),
                    Char("fq", "a footnote"),
                    ". ",
                    Char("xt", Ref("JHN 1:1", "John 1:1")),
                    " and ",
                    Char("xt", Ref("MRK 1:1", "Mark 1:1")),
                    "."
                ),
                ", so that we can test it."
            )
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertText("This is a verse with a footnote", "verse_1_1")
            .InsertNote(
                Delta
                    .New()
                    .InsertChar("1.1: ", "fr", _testGuidService.Generate())
                    .InsertChar("Refers to ", "ft", _testGuidService.Generate())
                    .InsertChar("a footnote", "fq", _testGuidService.Generate())
                    .Insert(". ")
                    .InsertCharRef("John 1:1", "xt", "JHN 1:1", _testGuidService.Generate())
                    .Insert(" and ")
                    .InsertCharRef("Mark 1:1", "xt", "MRK 1:1", _testGuidService.Generate())
                    .Insert("."),
                "f",
                "+",
                "verse_1_1"
            )
            .InsertText(", so that we can test it.", "verse_1_1")
            .InsertPara("p");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_EmptyRef()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            Para(
                "p",
                Verse("1"),
                "This is a verse with a footnote",
                Note(
                    "f",
                    "*",
                    Char("fr", "1:1"),
                    Char("ft", ""),
                    ". ",
                    Char("xo", ""),
                    Char("xt", Ref("MRK 1:1", "Mark 1:1"))
                ),
                ", so that we can test it."
            )
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertText("This is a verse with a footnote", "verse_1_1")
            .InsertNote(
                Delta
                    .New()
                    .InsertChar("1:1", "fr", _testGuidService.Generate())
                    .InsertEmptyChar("ft", _testGuidService.Generate())
                    .Insert(". ")
                    .InsertEmptyChar("xo", _testGuidService.Generate())
                    .InsertCharRef("Mark 1:1", "xt", "MRK 1:1", _testGuidService.Generate()),
                "f",
                "*",
                "verse_1_1"
            )
            .InsertText(", so that we can test it.", "verse_1_1")
            .InsertPara("p");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_InvalidRef()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            Para(
                "p",
                Verse("1"),
                "This is a verse with a footnote",
                Note(
                    "f",
                    "+",
                    Char("fr", "1.1: "),
                    Char("ft", "Refers to "),
                    Char("fq", "a footnote"),
                    ". ",
                    Char("xt", Ref("bad location", "John 1:1")),
                    " and ",
                    Char("xt", Ref("MRK 1:1", "Mark 1:1")),
                    "."
                ),
                ", so that we can test it."
            )
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertText("This is a verse with a footnote", "verse_1_1")
            .InsertNote(
                Delta
                    .New()
                    .InsertChar("1.1: ", "fr", _testGuidService.Generate())
                    .InsertChar("Refers to ", "ft", _testGuidService.Generate())
                    .InsertChar("a footnote", "fq", _testGuidService.Generate())
                    .Insert(". ")
                    .InsertCharRef("John 1:1", "xt", "bad location", _testGuidService.Generate(), invalid: true)
                    .Insert(" and ")
                    .InsertCharRef("Mark 1:1", "xt", "MRK 1:1", _testGuidService.Generate())
                    .Insert("."),
                "f",
                "+",
                "verse_1_1"
            )
            .InsertText(", so that we can test it.", "verse_1_1")
            .InsertPara("p");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].IsValid, Is.False);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_OptBreak()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            Para("p", Verse("1"), "This is a verse with a line break", OptBreak(), ", so that we can test it.")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertText("This is a verse with a line break", "verse_1_1")
            .InsertOptBreak("verse_1_1")
            .InsertText(", so that we can test it.", "verse_1_1")
            .InsertPara("p");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_Milestone()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            Para("p", Verse("1"), "This is a verse with a line break", Milestone("ts"), ", so that we can test it.")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertText("This is a verse with a line break", "verse_1_1")
            .InsertMilestone("ts", "verse_1_1")
            .InsertText(", so that we can test it.", "verse_1_1")
            .InsertPara("p");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_InvalidMilestone()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            Para("p", Verse("1"), "This is a verse with a line break", Milestone("bad"), ", so that we can test it.")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertText("This is a verse with a line break", "verse_1_1")
            .InsertMilestone("bad", "verse_1_1", true)
            .InsertText(", so that we can test it.", "verse_1_1")
            .InsertPara("p");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].IsValid, Is.False);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_TableAtEnd()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            Table(
                Row(
                    Cell("tc1", "start", "Before verse.", Verse("1"), "This is verse ", Char("it", "1"), "."),
                    Cell("tc2", "start", Verse("2"), "This is verse 2.")
                ),
                Row(Cell("tc1", "start"), Cell("tc2", "start", Verse("3"), "This is verse 3."))
            )
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertText("Before verse.", "cell_1_1_1")
            .InsertVerse("1")
            .InsertText("This is verse ", "verse_1_1")
            .InsertChar("1", "it", _testGuidService.Generate(), "verse_1_1")
            .InsertText(".", "verse_1_1")
            .InsertCell(1, 1, "tc1", "start")
            .InsertBlank("cell_1_1_2")
            .InsertVerse("2")
            .InsertText("This is verse 2.", "verse_1_2")
            .InsertCell(1, 1, "tc2", "start")
            .InsertBlank("cell_1_2_1")
            .InsertCell(1, 2, "tc1", "start")
            .InsertBlank("cell_1_2_2")
            .InsertVerse("3")
            .InsertText("This is verse 3.", "verse_1_3")
            .InsertCell(1, 2, "tc2", "start");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(3));
        Assert.That(chapterDeltas[0].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));

        // And we should be able to roundtrip it back.
        XDocument roundtrippedUsx = mapper.ToUsx(Usx("PHM", Chapter("1")), chapterDeltas);
        Assert.IsTrue(XNode.DeepEquals(roundtrippedUsx, usxDoc));
    }

    [Test]
    public void ToDelta_TableInMiddle()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            Table(
                Row(
                    Cell("tc1", "start", "Before verse.", Verse("1"), "This is verse ", Char("it", "1"), "."),
                    Cell("tc2", "start", Verse("2"), "This is verse 2.")
                ),
                Row(Cell("tc1", "start"), Cell("tc2", "start", Verse("3"), "This is verse 3."))
            ),
            Para("p", Verse("4"), "This is verse 4.")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertText("Before verse.", "cell_1_1_1")
            .InsertVerse("1")
            .InsertText("This is verse ", "verse_1_1")
            .InsertChar("1", "it", _testGuidService.Generate(), "verse_1_1")
            .InsertText(".", "verse_1_1")
            .InsertCell(1, 1, "tc1", "start")
            .InsertBlank("cell_1_1_2")
            .InsertVerse("2")
            .InsertText("This is verse 2.", "verse_1_2")
            .InsertCell(1, 1, "tc2", "start")
            .InsertBlank("cell_1_2_1")
            .InsertCell(1, 2, "tc1", "start")
            .InsertBlank("cell_1_2_2")
            .InsertVerse("3")
            .InsertText("This is verse 3.", "verse_1_3")
            .InsertCell(1, 2, "tc2", "start")
            .InsertBlank("p_1")
            .InsertVerse("4")
            .InsertText("This is verse 4.", "verse_1_4")
            .InsertPara("p");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(4));
        Assert.That(chapterDeltas[0].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));

        // And we should be able to roundtrip it back.
        XDocument roundtrippedUsx = mapper.ToUsx(Usx("PHM", Chapter("1")), chapterDeltas);
        Assert.IsTrue(XNode.DeepEquals(roundtrippedUsx, usxDoc));
    }

    [Test]
    public void ToDelta_TableInMiddleFollowedByCharStyle()
    {
        string ndCharID = _testGuidService.Generate();

        string bookUsfm = """
\id PHM
\c 1
\p
\v 1 B
\tr \th1 C
\tr \tc1 D
\p E
\v 2 F \nd ND\nd*
""";
        XmlDocument usfmToUsxLoading = UsfmToUsx.ConvertToXmlDocument(
            _scrText,
            new MockScrStylesheet("usfm.sty"),
            bookUsfm
        );
        using XmlNodeReader nodeReader = new(usfmToUsxLoading);
        nodeReader.MoveToContent();
        XDocument usfmToUsx = XDocument.Load(nodeReader);

        XDocument usxDoc = Usx(
            "PHM",
            null,
            "3.0",
            Chapter("1"),
            Para("p", Verse("1"), "B"),
            Table(Row(Cell("th1", "start", "C")), Row(Cell("tc1", "start", "D"))),
            Para("p", "E ", Verse("2"), "F ", Char("nd", "ND"))
        );

        Assert.That(XNode.DeepEquals(usxDoc, usfmToUsx));

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        // Note that these expected deltas are somewhat reverse engineered, rather than known to be what should really
        // be expected.
        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertText("B", "verse_1_1")
            .InsertPara("p")
            .InsertText("C", "cell_1_1_1")
            .InsertCell(1, 1, "th1", "start")
            .InsertText("D", "cell_1_2_1")
            .InsertCell(1, 2, "tc1", "start")
            .InsertText("E ", "p_2")
            .InsertVerse("2")
            .InsertText("F ", "verse_1_2")
            .InsertChar("ND", "nd", ndCharID, "verse_1_2")
            .InsertPara("p");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(2));
        Assert.That(chapterDeltas[0].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));

        // And we should be able to roundtrip it back.
        XDocument roundtrippedUsx = mapper.ToUsx(Usx("PHM", null, "3.0", Chapter("1")), chapterDeltas);
        Assert.IsTrue(XNode.DeepEquals(roundtrippedUsx, usxDoc));
    }

    [Test]
    public void ToDelta_AdjacentTables()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            Table(
                Row(
                    Cell("tc1", "start", Verse("1"), "This is verse 1."),
                    Cell("tc2", "start", Verse("2"), "This is verse 2.")
                ),
                Row(
                    Cell("tc1", "start", Verse("3"), "This is verse 3."),
                    Cell("tc2", "start", Verse("4"), "This is verse 4.")
                )
            ),
            Table(
                Row(
                    Cell("tc1", "start", Verse("5"), "This is verse 5."),
                    Cell("tc2", "start", Verse("6"), "This is verse 6.")
                ),
                Row(
                    Cell("tc1", "start", Verse("7"), "This is verse 7."),
                    Cell("tc2", "start", Verse("8"), "This is verse 8.")
                )
            )
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertBlank("cell_1_1_1")
            .InsertVerse("1")
            .InsertText("This is verse 1.", "verse_1_1")
            .InsertCell(1, 1, "tc1", "start")
            .InsertBlank("cell_1_1_2")
            .InsertVerse("2")
            .InsertText("This is verse 2.", "verse_1_2")
            .InsertCell(1, 1, "tc2", "start")
            .InsertBlank("cell_1_2_1")
            .InsertVerse("3")
            .InsertText("This is verse 3.", "verse_1_3")
            .InsertCell(1, 2, "tc1", "start")
            .InsertBlank("cell_1_2_2")
            .InsertVerse("4")
            .InsertText("This is verse 4.", "verse_1_4")
            .InsertCell(1, 2, "tc2", "start")
            .InsertBlank("cell_2_1_1")
            .InsertVerse("5")
            .InsertText("This is verse 5.", "verse_1_5")
            .InsertCell(2, 1, "tc1", "start")
            .InsertBlank("cell_2_1_2")
            .InsertVerse("6")
            .InsertText("This is verse 6.", "verse_1_6")
            .InsertCell(2, 1, "tc2", "start")
            .InsertBlank("cell_2_2_1")
            .InsertVerse("7")
            .InsertText("This is verse 7.", "verse_1_7")
            .InsertCell(2, 2, "tc1", "start")
            .InsertBlank("cell_2_2_2")
            .InsertVerse("8")
            .InsertText("This is verse 8.", "verse_1_8")
            .InsertCell(2, 2, "tc2", "start");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(8));
        Assert.That(chapterDeltas[0].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));

        // And we should be able to roundtrip it back.
        XDocument roundtrippedUsx = mapper.ToUsx(Usx("PHM", Chapter("1")), chapterDeltas);
        Assert.IsTrue(XNode.DeepEquals(roundtrippedUsx, usxDoc));
    }

    [Test]
    public void ToDelta_InvalidTable()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            Table(
                Row(
                    Cell("bad", "start", "Before verse.", Verse("1"), "This is verse ", Char("it", "1"), "."),
                    Cell("tc2", "start", Verse("2"), "This is verse 2.")
                ),
                Row(Cell("tc1", "start"), Cell("tc2", "start", Verse("3"), "This is verse 3."))
            )
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertText("Before verse.", "cell_1_1_1")
            .InsertVerse("1")
            .InsertText("This is verse ", "verse_1_1")
            .InsertChar("1", "it", _testGuidService.Generate(), "verse_1_1")
            .InsertText(".", "verse_1_1")
            .InsertCell(1, 1, "bad", "start", true)
            .InsertBlank("cell_1_1_2")
            .InsertVerse("2")
            .InsertText("This is verse 2.", "verse_1_2")
            .InsertCell(1, 1, "tc2", "start")
            .InsertBlank("cell_1_2_1")
            .InsertCell(1, 2, "tc1", "start")
            .InsertBlank("cell_1_2_2")
            .InsertVerse("3")
            .InsertText("This is verse 3.", "verse_1_3")
            .InsertCell(1, 2, "tc2", "start");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(3));
        Assert.That(chapterDeltas[0].IsValid, Is.False);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_NoParagraphs()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            Verse("1"),
            "This is verse 1.",
            Verse("2"),
            Verse("3"),
            "This is verse 3.",
            Chapter("2"),
            Verse("1"),
            Verse("2-3")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected1 = Delta
            .New()
            .InsertChapter("1")
            .InsertVerse("1")
            .InsertText("This is verse 1.", "verse_1_1")
            .InsertVerse("2")
            .InsertBlank("verse_1_2")
            .InsertVerse("3")
            .InsertText("This is verse 3.", "verse_1_3")
            .Insert("\n");
        var expected2 = Delta
            .New()
            .InsertChapter("2")
            .InsertVerse("1")
            .InsertBlank("verse_2_1")
            .InsertVerse("2-3")
            .InsertBlank("verse_2_2-3")
            .Insert("\n");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(3));
        Assert.That(chapterDeltas[0].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected1));
        Assert.That(chapterDeltas[1].Number, Is.EqualTo(2));
        Assert.That(chapterDeltas[1].LastVerse, Is.EqualTo(3));
        Assert.That(chapterDeltas[1].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[1].Delta.DeepEquals(expected2));
    }

    [Test]
    public void ToDelta_ImpliedParagraph()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            "This is an implied paragraph before the first verse.",
            Para("p", Verse("1"))
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = Delta
            .New()
            .InsertChapter("1")
            .Insert("This is an implied paragraph before the first verse.")
            .Insert("\n")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertBlank("verse_1_1")
            .InsertPara("p");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_ImpliedParagraphInVerse()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            "This is an implied paragraph before the first verse.",
            Para("p", "This is actually an implied paragraph as part of the verse.", Verse("1"))
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = Delta
            .New()
            .InsertChapter("1")
            .Insert("This is an implied paragraph before the first verse.")
            .Insert("\n")
            .InsertText("This is actually an implied paragraph as part of the verse.", "p_1")
            .InsertVerse("1")
            .InsertBlank("verse_1_1")
            .InsertPara("p");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_NoParagraphsImpliedParagraph()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            "This is an implied paragraph before the first verse.",
            Verse("1"),
            "This is verse 1.",
            Verse("2"),
            Verse("3"),
            "This is verse 3.",
            Chapter("2"),
            Verse("1"),
            Verse("2-3")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected1 = Delta
            .New()
            .InsertChapter("1")
            .Insert("This is an implied paragraph before the first verse.")
            .InsertVerse("1")
            .InsertText("This is verse 1.", "verse_1_1")
            .InsertVerse("2")
            .InsertBlank("verse_1_2")
            .InsertVerse("3")
            .InsertText("This is verse 3.", "verse_1_3")
            .Insert("\n");
        var expected2 = Delta
            .New()
            .InsertChapter("2")
            .InsertVerse("1")
            .InsertBlank("verse_2_1")
            .InsertVerse("2-3")
            .InsertBlank("verse_2_2-3")
            .Insert("\n");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(3));
        Assert.That(chapterDeltas[0].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected1));
        Assert.That(chapterDeltas[1].Number, Is.EqualTo(2));
        Assert.That(chapterDeltas[1].LastVerse, Is.EqualTo(3));
        Assert.That(chapterDeltas[1].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[1].Delta.DeepEquals(expected2));
    }

    [Test]
    public void ToDelta_EmptyBook()
    {
        XDocument usxDoc = Usx("PHM");

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        Assert.That(chapterDeltas.Count, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(0));
        Assert.That(chapterDeltas[0].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(new Delta()));
    }

    [Test]
    public void ToDelta_EmptyStyle()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            Para("p", Verse("1"), Verse("2")),
            Para(""),
            Para("li"),
            Para("", Verse("3"))
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertBlank("verse_1_1")
            .InsertVerse("2")
            .InsertBlank("verse_1_2")
            .InsertPara("p")
            .InsertBlank("verse_1_2/_1")
            .InsertPara("")
            .InsertBlank("verse_1_2/li_2")
            .InsertPara("li")
            .InsertBlank("verse_1_2/_3")
            .InsertVerse("3")
            .InsertBlank("verse_1_3")
            .InsertPara("");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(3));
        Assert.That(chapterDeltas[0].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_BlankLine()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            Para("p", Verse("1"), Verse("2")),
            Para("b"),
            Para("p", Verse("3"))
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertBlank("verse_1_1")
            .InsertVerse("2")
            .InsertBlank("verse_1_2")
            .InsertPara("p")
            .InsertPara("b")
            .InsertBlank("verse_1_2/p_1")
            .InsertVerse("3")
            .InsertBlank("verse_1_3")
            .InsertPara("p");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(3));
    }

    [Test]
    public void ToDelta_BlankLineContainsText()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            Para("p", Verse("1"), "Verse text."),
            // support this even though we do not encourage users to type text in line breaks
            Para("b", "Text in line break"),
            Para("p", "second segment in verse.")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = new Delta()
            .InsertChapter("1")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertText("Verse text.", "verse_1_1")
            .InsertPara("p")
            .InsertText("Text in line break")
            .InsertPara("b")
            .InsertText("second segment in verse.", "verse_1_1/p_1")
            .InsertPara("p");

        Assert.That(chapterDeltas.Count, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_InvalidParaInFirstChapter()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Para("imt", "Book title"),
            Chapter("1"),
            Para("bad", Verse("1"), "Verse text."),
            Chapter("2"),
            Para("p", Verse("1"), "Verse text."),
            Chapter("3"),
            Para("p", Verse("1"), "Verse text.")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expectedChapter1 = Delta
            .New()
            .InsertText("Book title", "imt_1")
            .InsertPara("imt")
            .InsertChapter("1")
            .InsertBlank("bad_1")
            .InsertVerse("1")
            .InsertText("Verse text.", "verse_1_1")
            .InsertPara("bad", true);
        var expectedChapter2 = Delta
            .New()
            .InsertChapter("2")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertText("Verse text.", "verse_2_1")
            .InsertPara("p");
        var expectedChapter3 = Delta
            .New()
            .InsertChapter("3")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertText("Verse text.", "verse_3_1")
            .InsertPara("p");

        Assert.That(chapterDeltas.Count, Is.EqualTo(3));
        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].IsValid, Is.False);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expectedChapter1));
        Assert.That(chapterDeltas[1].Number, Is.EqualTo(2));
        Assert.That(chapterDeltas[1].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[1].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[1].Delta.DeepEquals(expectedChapter2));
        Assert.That(chapterDeltas[2].Number, Is.EqualTo(3));
        Assert.That(chapterDeltas[2].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[2].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[2].Delta.DeepEquals(expectedChapter3));
    }

    [Test]
    public void ToDelta_InvalidParaInMiddleChapter()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Para("imt", "Book title"),
            Chapter("1"),
            Para("p", Verse("1"), "Verse text."),
            Chapter("2"),
            Para("bad", Verse("1"), "Verse text."),
            Chapter("3"),
            Para("p", Verse("1"), "Verse text.")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expectedChapter1 = Delta
            .New()
            .InsertText("Book title", "imt_1")
            .InsertPara("imt")
            .InsertChapter("1")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertText("Verse text.", "verse_1_1")
            .InsertPara("p");
        var expectedChapter2 = Delta
            .New()
            .InsertChapter("2")
            .InsertBlank("bad_1")
            .InsertVerse("1")
            .InsertText("Verse text.", "verse_2_1")
            .InsertPara("bad", true);
        var expectedChapter3 = Delta
            .New()
            .InsertChapter("3")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertText("Verse text.", "verse_3_1")
            .InsertPara("p");

        Assert.That(chapterDeltas.Count, Is.EqualTo(3));
        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expectedChapter1));
        Assert.That(chapterDeltas[1].Number, Is.EqualTo(2));
        Assert.That(chapterDeltas[1].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[1].IsValid, Is.False);
        Assert.IsTrue(chapterDeltas[1].Delta.DeepEquals(expectedChapter2));
        Assert.That(chapterDeltas[2].Number, Is.EqualTo(3));
        Assert.That(chapterDeltas[2].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[2].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[2].Delta.DeepEquals(expectedChapter3));
    }

    [Test]
    public void ToDelta_InvalidParaInLastChapter()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Para("imt", "Book title"),
            Chapter("1"),
            Para("p", Verse("1"), "Verse text."),
            Chapter("2"),
            Para("p", Verse("1"), "Verse text."),
            Chapter("3"),
            Para("bad", Verse("1"), "Verse text.")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expectedChapter1 = Delta
            .New()
            .InsertText("Book title", "imt_1")
            .InsertPara("imt")
            .InsertChapter("1")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertText("Verse text.", "verse_1_1")
            .InsertPara("p");
        var expectedChapter2 = Delta
            .New()
            .InsertChapter("2")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertText("Verse text.", "verse_2_1")
            .InsertPara("p");
        var expectedChapter3 = Delta
            .New()
            .InsertChapter("3")
            .InsertBlank("bad_1")
            .InsertVerse("1")
            .InsertText("Verse text.", "verse_3_1")
            .InsertPara("bad", true);

        Assert.That(chapterDeltas.Count, Is.EqualTo(3));
        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expectedChapter1));
        Assert.That(chapterDeltas[1].Number, Is.EqualTo(2));
        Assert.That(chapterDeltas[1].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[1].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[1].Delta.DeepEquals(expectedChapter2));
        Assert.That(chapterDeltas[2].Number, Is.EqualTo(3));
        Assert.That(chapterDeltas[2].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[2].IsValid, Is.False);
        Assert.IsTrue(chapterDeltas[2].Delta.DeepEquals(expectedChapter3));
    }

    [Test]
    public void ToDelta_InvalidParaContainingVerse()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            Para("s", Verse("1"), "This verse should not exist within this paragraph style")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertBlank("s_1")
            .InsertVerse("1")
            .InsertText("This verse should not exist within this paragraph style", "verse_1_1")
            .InsertPara("s", true);

        Assert.That(chapterDeltas.Count, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].IsValid, Is.False);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_SecondChapterInInvalidBook()
    {
        XDocument usxDoc = Usx(
            "TDX",
            Chapter("1"),
            Para("q", Verse("1"), "This verse is valid, but in an invalid book"),
            Chapter("2"),
            Para("q", Verse("1"), "This verse is also valid, but in an invalid book")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = new[]
        {
            Delta
                .New()
                .InsertChapter("1")
                .InsertBlank("q_1")
                .InsertVerse("1")
                .InsertText("This verse is valid, but in an invalid book", "verse_1_1")
                .InsertPara("q"),
            Delta
                .New()
                .InsertChapter("2")
                .InsertBlank("q_1")
                .InsertVerse("1")
                .InsertText("This verse is also valid, but in an invalid book", "verse_2_1")
                .InsertPara("q"),
        };

        Assert.That(chapterDeltas.Count, Is.EqualTo(2));
        Assert.That(chapterDeltas[0].IsValid, Is.False);
        Assert.That(chapterDeltas[1].IsValid, Is.False);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected[0]));
        Assert.IsTrue(chapterDeltas[1].Delta.DeepEquals(expected[1]));
    }

    [Test]
    public void ToDelta_LineBreakWithinVerse()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            Para("q", Verse("1"), "Poetry first line"),
            Para("q", "Poetry second line"),
            Para("b"),
            Para("q", "Poetry third line"),
            Para("q", "Poetry fourth line.")
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = new Delta()
            .InsertChapter("1")
            .InsertBlank("q_1")
            .InsertVerse("1")
            .InsertText("Poetry first line", "verse_1_1")
            .InsertPara("q")
            .InsertText("Poetry second line", "verse_1_1/q_1")
            .InsertPara("q")
            .InsertPara("b")
            .InsertText("Poetry third line", "verse_1_1/q_2")
            .InsertPara("q")
            .InsertText("Poetry fourth line.", "verse_1_1/q_3")
            .InsertPara("q");

        Assert.That(chapterDeltas.Count, Is.EqualTo(1));
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void ToDelta_Unmatched()
    {
        XDocument usxDoc = Usx(
            "PHM",
            Chapter("1"),
            Para("p", Verse("1"), "This is a verse with an unmatched marker", Unmatched("bad"))
        );

        var mapper = new DeltaUsxMapper(_mapperGuidService, _logger, _exceptionHandler);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(usxDoc)];

        var expected = Delta
            .New()
            .InsertChapter("1")
            .InsertBlank("p_1")
            .InsertVerse("1")
            .InsertText("This is a verse with an unmatched marker", "verse_1_1")
            .InsertEmbed("unmatched", new JObject(new JProperty("marker", "bad")), "verse_1_1")
            .InsertPara("p");

        Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(1));
        Assert.That(chapterDeltas[0].IsValid, Is.True);
        Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
    }

    [Test]
    public void Roundtrip_FootnoteInChapterNumber()
    {
        AssertRoundtrips(
            """
            \id ESG - A
            \c 1
            \cp A \f + \fr 1: \ft Chapter A 1-17 corresponds to chapters 11.2—12.6 in a number of English translations.\f*
            \s Mordecai's Strange Dream
            \p
            \v 1 Mordecai, a Jew who belonged to the tribe of Benjamin,
            """
        );
        AssertRoundtrips(
            """
            \id ESG - A
            \c 1
            \cp A \f + \fr 1: \ft Chapter A 1-17 corresponds to chapters 11.2—12.6 in a number of English translations.\f*
            \v 1 Mordecai, a Jew who belonged to the tribe of Benjamin,
            """
        );
        AssertRoundtrips(
            """
            \id ESG - A
            \c 1
            \cp A \f + \fr 1: \ft Chapter A 1-17 corresponds to chapters 11.2—12.6 in a number of English translations.\f*
            \v 1 Mordecai, a Jew who belonged to the tribe of Benjamin,
            \p
            \v 2 He was a
            """
        );
    }

    [Test]
    public void Roundtrip_FootnoteInFirstSegment()
    {
        AssertRoundtrips(
            """
            \id ESG - A
            \c 1
            \cp A
            \s \f + \fr 1: \ft Chapter A 1-17 corresponds to chapters 11.2—12.6 in a number of English translations.\f* Mordecai's Strange Dream
            \p
            \v 1 Mordecai, a Jew who belonged to the tribe of Benjamin,
            """
        );
    }

    [Test]
    public void Roundtrip_TableFollowedByCharStyle()
    {
        AssertRoundtrips(
            """
\id PHM
\c 1
\p
\v 1 B
\tr \th1 C
\tr \tc1 D
\p
\p E
\v 2 F \nd ND\nd*
"""
        );

        AssertRoundtrips(
            """
\id PHM
\c 1
\p
\v 1 B
\tr \th1 C
\tr \tc1 D
\p
\v 2 F \nd ND\nd*
"""
        );

        AssertRoundtrips(
            """
\id NUM - A
\c 1
\p
\v 1 B
\tr \th1 C
\tr \tc1 D
\p E
\v 2 F \nd ND\nd*
"""
        );
    }

    [Test]
    public void Roundtrip_NestedChars()
    {
        AssertRoundtrips(
            """
\id PHM
            \c 1
            \p
\v 1 \bd \+sup 1\+sup* This is\+sup 2\+sup* bold text.\+sup 3\+sup* \bd*  This is normal text.
"""
        );
    }

    [Test]
    public void Roundtrip_NestedCharsInTable()
    {
        AssertRoundtrips(
            """
\id NUM - A
\c 1
\p
\v 1 B
\tr \th1 H1 \th1 H2
\tr \tc1 D \tc1 \bd \+sup 1\+sup* This is\+sup 2\+sup* bold text.\+sup 3\+sup* \bd*  This is normal text.
\p E
\v 2 F \nd ND\nd*
"""
        );

        AssertRoundtrips(
            """
\id NUM - A
\c 1
\p
\v 1 B
\tr \th1 H1 \th1 H2
\tr \tc1 D \tc1 \bd \+sup 1\+sup* This is\+sup 2\+sup* bold text.\+sup 3\+sup* \bd*
\p E
\v 2 F \nd ND\nd*
"""
        );
    }

    [Test]
    public void Roundtrip_MissingChapters()
    {
        AssertRoundtrips(
            """
            \id PRO - A
            \c 2
            \v 1 My son, if thou wilt...
            \c 3
            \v 1 My son, forget not...
            """
        );
    }

    [Test]
    public async Task RoundTrip_Hebrew() => await RoundTripTestHelper("heb_usfm", "heb");

    [Test]
    public async Task RoundTrip_Asv() => await RoundTripTestHelper("eng-asv_usfm-partial", "eng-asv");

    private async Task RoundTripTestHelper(string projectZipFilename, string projectShortName)
    {
        string zipFilePath = Path.Combine(GetPathToTestProject(), "SampleData", $"{projectZipFilename}.zip");
        await using FileStream zipFileStream = new FileStream(zipFilePath, FileMode.Open, FileAccess.Read);
        using ZipArchive archive = new ZipArchive(zipFileStream, ZipArchiveMode.Read);
        Assert.That(archive.Entries.Any(), "setup. unexpected input size.");
        bool allBooksRoundtrip = true;
        List<string> errorMessages = [];
        foreach (ZipArchiveEntry entry in archive.Entries)
        {
            string bookCode = Regex
                .Match(entry.Name, @$".*([A-Z0-9][A-Z0-9][A-Z0-9]){projectShortName}\..*")
                .Groups[1]
                .Value;
            if (entry.Name.EndsWith("sfm", StringComparison.OrdinalIgnoreCase) && bookCode is not ("FRT" or "INT"))
            {
                await using Stream entryStream = entry.Open();
                using StreamReader reader = new StreamReader(entryStream);

                // Read and stream the contents of the text file
                string bookUsfm = await reader.ReadToEndAsync();
                if (!DoesRoundtrip(bookUsfm, out string errorMessage))
                {
                    allBooksRoundtrip = false;
                    errorMessages.Add(errorMessage);
                }
            }
        }
        Assert.That(allBooksRoundtrip, Is.True, string.Join(Environment.NewLine, errorMessages));
    }

    private void AssertRoundtrips(string bookUsfm) =>
        Assert.That(DoesRoundtrip(bookUsfm, out string errorMessage), Is.True, errorMessage);

    private static string ExtractBookCode(string bookUsfm)
    {
        string firstLine = bookUsfm.Split('\n').FirstOrDefault()?.Trim();
        string bookCode = Regex.Match(firstLine, @"\\id\s+(\w+)").Groups[1].Value;
        return bookCode;
    }

    private bool DoesRoundtrip(string bookUsfm, out string errorMessage)
    {
        string bookCode = ExtractBookCode(bookUsfm);

        XmlDocument bookUsxLoading = UsfmToUsx.ConvertToXmlDocument(
            _scrText,
            new MockScrStylesheet("usfm.sty"),
            bookUsfm
        );
        using XmlNodeReader nodeReader = new(bookUsxLoading);
        nodeReader.MoveToContent();
        XDocument bookUsx = XDocument.Load(nodeReader);
        // Record the usx version string to make it match when later compared.
        string usxVersion = bookUsx.Elements("usx").First().Attribute("version")!.Value;
        // Record any text in the book node, which some books have, like <book code="GEN">- American Standard
        // Version</book>
        string? bookDesc = bookUsx.Elements("usx").Elements("book").First().FirstNode?.ToString();
        DeltaUsxMapper mapper = new(_mapperGuidService, _logger, _exceptionHandler);

        // SUT part 1
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(bookUsx)];

        IEnumerable<XElement> chaptersToProcess = bookUsx
            .Elements("usx")
            .Elements("chapter")
            .Select(x => Chapter(x.Attribute("number")!.Value));

        // SUT part 2
        XDocument roundTrippedUsx = mapper.ToUsx(Usx(bookCode, bookDesc, usxVersion, chaptersToProcess), chapterDeltas);
        bool didRoundtrip = XNode.DeepEquals(bookUsx, roundTrippedUsx);
        errorMessage = null;
        if (!didRoundtrip)
        {
            errorMessage = $"Trouble roundtripping {bookCode}.";
            IEnumerable<int> invalidChapters = chapterDeltas
                .Where((ChapterDelta cd) => !cd.IsValid)
                .Select((ChapterDelta cd) => cd.Number);
            if (invalidChapters.Any())
                errorMessage += $" Note that the following chapters were invalid: {string.Join(" ", invalidChapters)}";
        }
        return didRoundtrip;
    }

    private static string GetPathToTestProject() =>
        new FileInfo(Assembly.GetExecutingAssembly().Location).Directory.Parent.Parent.Parent.FullName;

    private static XDocument Usx(string code, string? bookInnerText, string usxVersion, params object[] elems) =>
        new XDocument(new XElement("usx", new XAttribute("version", usxVersion), Book(code, bookInnerText), elems));

    private static XDocument Usx(string code, params object[] elems) =>
        new XDocument(new XElement("usx", new XAttribute("version", "2.5"), Book(code), elems));

    private static XElement Book(string code, string? innerText = null) =>
        innerText == null
            ? new XElement("book", new XAttribute("code", code), new XAttribute("style", "id"))
            : new XElement("book", new XAttribute("code", code), new XAttribute("style", "id"), innerText);

    private static XElement Para(string style, params object[] contents)
    {
        var elem = new XElement("para", new XAttribute("style", style), contents);
        if (style == "")
            elem.Add(new XAttribute("status", "unknown"));
        return elem;
    }

    private static XElement Chapter(string number, string style = "c") =>
        new XElement("chapter", new XAttribute("number", number), new XAttribute("style", style));

    private static XElement Verse(string number, string style = "v") =>
        new XElement("verse", new XAttribute("number", number), new XAttribute("style", style));

    private static XElement Char(string style, params object[] contents) =>
        new XElement("char", new XAttribute("style", style), contents);

    private static XElement Ref(string loc, string text) => new XElement("ref", new XAttribute("loc", loc), text);

    private static XElement Note(string style, string caller, params object[] contents) =>
        new XElement("note", new XAttribute("style", style), new XAttribute("caller", caller), contents);

    private static XElement Figure(string file, string size, string reference, string text)
    {
        var elem = new XElement("figure", new XAttribute("style", "fig"));
        if (file != null)
            elem.Add(new XAttribute("file", file));
        if (size != null)
            elem.Add(new XAttribute("size", size));
        if (reference != null)
            elem.Add(new XAttribute("ref", reference));
        if (text != null)
            elem.Add(text);
        return elem;
    }

    private static XElement OptBreak() => new XElement("optbreak");

    private static XElement Milestone(string style) => new XElement("ms", new XAttribute("style", style));

    private static XElement Table(params object[] contents) => new XElement("table", contents);

    private static XElement Row(params object[] contents) =>
        new XElement("row", new XAttribute("style", "tr"), contents);

    private static XElement Cell(string style, string align, params object[] contents) =>
        new XElement("cell", new XAttribute("style", style), new XAttribute("align", align), contents);

    private static XElement Unmatched(string marker) => new XElement("unmatched", new XAttribute("marker", marker));
}
