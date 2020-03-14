using System.Linq;
using System.Collections.Generic;
using System.Xml.Linq;
using NUnit.Framework;
using SIL.XForge.Realtime.RichText;
using Newtonsoft.Json.Linq;

namespace SIL.XForge.Scripture.Services
{
    [TestFixture]
    public class DeltaUsxMapperTests
    {
        [Test]
        public void ToUsx_HeaderPara()
        {
            var chapterDelta = new ChapterDelta(1, 0, true, Delta.New()
                .InsertText("Philemon", "h_1")
                .InsertPara("h")
                .Insert("\n"));

            var mapper = new DeltaUsxMapper();
            XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

            XDocument expected = Usx("PHM",
                Para("h", "Philemon"));
            Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
        }

        [Test]
        public void ToUsx_VerseText()
        {
            var chapterDelta = new ChapterDelta(1, 1, true, Delta.New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("Verse text.", "verse_1_1")
                .InsertPara("p")
                .Insert("\n"));

            var mapper = new DeltaUsxMapper();
            XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

            XDocument expected = Usx("PHM",
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    "Verse text."));
            Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
        }

        [Test]
        public void ToUsx_EmptySegments()
        {
            var chapterDelta = new ChapterDelta(1, 3, true, Delta.New()
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
                .Insert("\n"));

            var mapper = new DeltaUsxMapper();
            XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

            XDocument expected = Usx("PHM",
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    Verse("2")),
                Para("li"),
                Para("li"),
                Para("p",
                    Verse("3")));
            Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
        }

        [Test]
        public void ToUsx_CharText()
        {
            var chapterDelta = new ChapterDelta(1, 1, true, Delta.New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("This is some ", "verse_1_1")
                .InsertChar("bold", "bd", "verse_1_1")
                .InsertText(" text.", "verse_1_1")
                .InsertPara("p")
                .Insert("\n"));

            var mapper = new DeltaUsxMapper();
            XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

            XDocument expected = Usx("PHM",
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    "This is some ",
                    Char("bd", "bold"),
                    " text."));
            Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
        }

        [Test]
        public void ToUsx_Note()
        {
            var chapterDelta = new ChapterDelta(1, 1, true, Delta.New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("This is a verse with a footnote", "verse_1_1")
                .InsertNote(Delta.New()
                    .InsertChar("1.1: ", "fr")
                    .InsertChar("Refers to ", "ft")
                    .InsertChar("a footnote", "fq")
                    .Insert(". ")
                    .InsertChar("John 1:1", "xt")
                    .Insert(" and ")
                    .InsertChar("Mark 1:1", "xt"), "f", "+", "verse_1_1")
                .InsertText(", so that we can test it.", "verse_1_1")
                .InsertPara("p")
                .Insert("\n"));

            var mapper = new DeltaUsxMapper();
            XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

            XDocument expected = Usx("PHM",
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    "This is a verse with a footnote",
                    Note("f", "+",
                        Char("fr", "1.1: "),
                        Char("ft", "Refers to "),
                        Char("fq", "a footnote"),
                        ". ",
                        Char("xt", "John 1:1"),
                        " and ",
                        Char("xt", "Mark 1:1")),
                    ", so that we can test it."));
            Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
        }

        [Test]
        public void ToUsx_Figure()
        {
            var chapterDelta = new ChapterDelta(1, 1, true, Delta.New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("This is a verse with a figure", "verse_1_1")
                .InsertFigure("file.jpg", "col", "PHM 1:1", "Caption", "verse_1_1")
                .InsertText(", so that we can test it.", "verse_1_1")
                .InsertPara("p")
                .Insert("\n"));

            var mapper = new DeltaUsxMapper();
            XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

            XDocument expected = Usx("PHM",
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    "This is a verse with a figure",
                    Figure("file.jpg", "col", "PHM 1:1", "Caption"),
                    ", so that we can test it."));
            Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
        }

        [Test]
        public void ToUsx_NestedChars()
        {
            var chapterDelta = new ChapterDelta(1, 1, true, Delta.New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertChar("1", new[] { "bd", "sup" }, "verse_1_1")
                .InsertChar("This is", "bd", "verse_1_1")
                .InsertChar("2", new[] { "bd", "sup" }, "verse_1_1")
                .InsertChar(" bold text.", "bd", "verse_1_1")
                .InsertChar("3", new[] { "bd", "sup" }, "verse_1_1")
                .InsertText(" This is normal text.", "verse_1_1")
                .InsertPara("p"));

            var mapper = new DeltaUsxMapper();
            XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

            XDocument expected = Usx("PHM",
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    Char("bd",
                        Char("sup", "1"),
                        "This is",
                        Char("sup", "2"),
                        " bold text.",
                        Char("sup", "3")),
                    " This is normal text."));
            Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
        }

        [Test]
        public void ToUsx_Ref()
        {
            var chapterDelta = new ChapterDelta(1, 1, true, Delta.New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("This is a verse with a footnote", "verse_1_1")
                .InsertNote(Delta.New()
                    .InsertChar("1.1: ", "fr")
                    .InsertChar("Refers to ", "ft")
                    .InsertChar("a footnote", "fq")
                    .Insert(". ")
                    .InsertCharRef("John 1:1", "xt", "JHN 1:1")
                    .Insert(" and ")
                    .InsertCharRef("Mark 1:1", "xt", "MRK 1:1")
                    .Insert("."), "f", "+", "verse_1_1")
                .InsertText(", so that we can test it.", "verse_1_1")
                .InsertPara("p")
                .Insert("\n"));

            var mapper = new DeltaUsxMapper();
            XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

            XDocument expected = Usx("PHM",
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    "This is a verse with a footnote",
                    Note("f", "+",
                        Char("fr", "1.1: "),
                        Char("ft", "Refers to "),
                        Char("fq", "a footnote"),
                        ". ",
                        Char("xt", Ref("JHN 1:1", "John 1:1")),
                        " and ",
                        Char("xt", Ref("MRK 1:1", "Mark 1:1")),
                        "."),
                    ", so that we can test it."));
            Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
        }

        [Test]
        public void ToUsx_OptBreak()
        {
            var chapterDelta = new ChapterDelta(1, 1, true, Delta.New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("This is a verse with a line break", "verse_1_1")
                .InsertOptBreak("verse_1_1")
                .InsertText(", so that we can test it.", "verse_1_1")
                .InsertPara("p"));

            var mapper = new DeltaUsxMapper();
            XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

            XDocument expected = Usx("PHM",
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    "This is a verse with a line break",
                    OptBreak(),
                    ", so that we can test it."));
            Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
        }

        [Test]
        public void ToUsx_Milestone()
        {
            var chapterDelta = new ChapterDelta(1, 1, true, Delta.New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("This is a verse with a milestone", "verse_1_1")
                .InsertMilestone("ts", "verse_1_1")
                .InsertText(", so that we can test it.", "verse_1_1")
                .InsertPara("p"));

            var mapper = new DeltaUsxMapper();
            XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

            XDocument expected = Usx("PHM",
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    "This is a verse with a milestone",
                    Milestone("ts"),
                    ", so that we can test it."));
            Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
        }

        [Test]
        public void ToUsx_TableAtEnd()
        {
            var chapterDelta = new ChapterDelta(1, 3, true, Delta.New()
                .InsertChapter("1")
                .InsertText("Before verse.", "cell_1_1_1")
                .InsertVerse("1")
                .InsertText("This is verse ", "verse_1_1")
                .InsertChar("1", "it", "verse_1_1")
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
                .InsertCell(1, 2, "tc2", "start"));

            var mapper = new DeltaUsxMapper();
            XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

            XDocument expected = Usx("PHM",
                Chapter("1"),
                Table(
                    Row(
                        Cell("tc1", "start", "Before verse.", Verse("1"), "This is verse ", Char("it", "1"), "."),
                        Cell("tc2", "start", Verse("2"), "This is verse 2.")),
                    Row(
                        Cell("tc1", "start"),
                        Cell("tc2", "start", Verse("3"), "This is verse 3."))));
            Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
        }

        [Test]
        public void ToUsx_TableInMiddle()
        {
            var chapterDelta = new ChapterDelta(1, 4, true, Delta.New()
                .InsertChapter("1")
                .InsertText("Before verse.", "cell_1_1_1")
                .InsertVerse("1")
                .InsertText("This is verse ", "verse_1_1")
                .InsertChar("1", "it", "verse_1_1")
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
                .InsertPara("p"));

            var mapper = new DeltaUsxMapper();
            XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

            XDocument expected = Usx("PHM",
                Chapter("1"),
                Table(
                    Row(
                        Cell("tc1", "start", "Before verse.", Verse("1"), "This is verse ", Char("it", "1"), "."),
                        Cell("tc2", "start", Verse("2"), "This is verse 2.")),
                    Row(
                        Cell("tc1", "start"),
                        Cell("tc2", "start", Verse("3"), "This is verse 3."))),
                Para("p", Verse("4"), "This is verse 4."));
            Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
        }

        [Test]
        public void ToUsx_AdjacentTables()
        {
            var chapterDelta = new ChapterDelta(1, 8, true, Delta.New()
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
                .InsertCell(2, 2, "tc2", "start"));

            var mapper = new DeltaUsxMapper();
            XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

            XDocument expected = Usx("PHM",
                Chapter("1"),
                Table(
                    Row(
                        Cell("tc1", "start", Verse("1"), "This is verse 1."),
                        Cell("tc2", "start", Verse("2"), "This is verse 2.")),
                    Row(
                        Cell("tc1", "start", Verse("3"), "This is verse 3."),
                        Cell("tc2", "start", Verse("4"), "This is verse 4."))),
                Table(
                    Row(
                        Cell("tc1", "start", Verse("5"), "This is verse 5."),
                        Cell("tc2", "start", Verse("6"), "This is verse 6.")),
                    Row(
                        Cell("tc1", "start", Verse("7"), "This is verse 7."),
                        Cell("tc2", "start", Verse("8"), "This is verse 8."))));
            Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
        }

        [Test]
        public void ToUsx_ConsecutiveSameStyleEmptyParas()
        {
            var chapterDelta = new ChapterDelta(1, 0, true, Delta.New()
                .InsertBlank("p_1")
                .InsertPara("p")
                .InsertBlank("p_2")
                .InsertPara("p"));

            var mapper = new DeltaUsxMapper();
            XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

            XDocument expected = Usx("PHM",
                Para("p"),
                Para("p"));
            Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
        }

        [Test]
        public void ToUsx_NoParagraphs()
        {
            var chapterDeltas = new[]
            {
                new ChapterDelta(1, 3, true, Delta.New()
                    .InsertChapter("1")
                    .InsertVerse("1")
                    .InsertText("This is verse 1.", "verse_1_1")
                    .InsertVerse("2")
                    .InsertBlank("verse_1_2")
                    .InsertVerse("3")
                    .InsertText("This is verse 3.", "verse_1_3")
                    .Insert("\n")),
                new ChapterDelta(2, 2, true, Delta.New()
                    .InsertChapter("2")
                    .InsertVerse("1")
                    .InsertBlank("verse_2_1")
                    .InsertVerse("2")
                    .InsertBlank("verse_2_2")
                    .Insert("\n"))
            };

            var mapper = new DeltaUsxMapper();
            XDocument newUsxDoc = mapper.ToUsx(Usx("PHM", Chapter("1"), "Text", Chapter("2"), "Text"), chapterDeltas);

            XDocument expected = Usx("PHM",
                Chapter("1"),
                Verse("1"),
                "This is verse 1.",
                Verse("2"),
                Verse("3"),
                "This is verse 3.",
                Chapter("2"),
                Verse("1"),
                Verse("2"));
            Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
        }

        [Test]
        public void ToUsx_EmptyBook()
        {
            var chapterDeltas = new[] { new ChapterDelta(1, 0, true, new Delta()) };

            var mapper = new DeltaUsxMapper();
            XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), chapterDeltas);

            XDocument expected = Usx("PHM");
            Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
        }

        [Test]
        public void ToUsx_BlankLine()
        {
            var chapterDelta = new ChapterDelta(1, 3, true, Delta.New()
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
                .InsertPara("p"));

            var mapper = new DeltaUsxMapper();
            XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

            XDocument expected = Usx("PHM",
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    Verse("2")),
                Para("b"),
                Para("p",
                    Verse("3")));
            Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
        }

        [Test]
        public void ToUsx_MultipleBookElements()
        {
            var chapterDelta = new ChapterDelta(1, 1, true, Delta.New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("Verse text.", "verse_1_1")
                .InsertPara("p")
                .Insert("\n"));

            var mapper = new DeltaUsxMapper();
            XDocument newUsxDoc = mapper.ToUsx(Usx("XXA", Book("PHM"), Chapter("1")), new[] { chapterDelta });

            XDocument expected = Usx("XXA",
                Book("PHM"),
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    "Verse text."));
            Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
        }

        [Test]
        public void ToUsx_InvalidParaInFirstChapter()
        {
            var chapterDeltas = new[]
            {
                new ChapterDelta(1, 1, false, Delta.New()
                    .InsertText("Book title", "imt_1")
                    .InsertPara("imt")
                    .InsertChapter("1")
                    .InsertBlank("bad_1")
                    .InsertVerse("1")
                    .InsertText("New verse text.", "verse_1_1")
                    .InsertPara("bad", true)),
                new ChapterDelta(2, 1, true, Delta.New()
                    .InsertChapter("2")
                    .InsertBlank("p_1")
                    .InsertVerse("1")
                    .InsertText("New verse text.", "verse_2_1")
                    .InsertPara("p")),
                new ChapterDelta(3, 1, true, Delta.New()
                    .InsertChapter("3")
                    .InsertBlank("p_1")
                    .InsertVerse("1")
                    .InsertText("New verse text.", "verse_3_1")
                    .InsertPara("p"))
            };

            var oldUsxDoc = Usx("PHM",
                Para("imt", "Book title"),
                Chapter("1"),
                Para("bad",
                    Verse("1"),
                    "Old verse text."),
                Chapter("2"),
                Para("p",
                    Verse("1"),
                    "Old verse text."),
                Chapter("3"),
                Para("p",
                    Verse("1"),
                    "Old verse text."));

            var mapper = new DeltaUsxMapper();
            XDocument newUsxDoc = mapper.ToUsx(oldUsxDoc, chapterDeltas);

            XDocument expected = Usx("PHM",
                Para("imt", "Book title"),
                Chapter("1"),
                Para("bad",
                    Verse("1"),
                    "Old verse text."),
                Chapter("2"),
                Para("p",
                    Verse("1"),
                    "New verse text."),
                Chapter("3"),
                Para("p",
                    Verse("1"),
                    "New verse text."));
            Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
        }

        [Test]
        public void ToUsx_InvalidParaInMiddleChapter()
        {
            var chapterDeltas = new[]
            {
                new ChapterDelta(1, 1, true, Delta.New()
                    .InsertText("Book title", "imt_1")
                    .InsertPara("imt")
                    .InsertChapter("1")
                    .InsertBlank("p_1")
                    .InsertVerse("1")
                    .InsertText("New verse text.", "verse_1_1")
                    .InsertPara("p")),
                new ChapterDelta(2, 1, false, Delta.New()
                    .InsertChapter("2")
                    .InsertBlank("bad_1")
                    .InsertVerse("1")
                    .InsertText("New verse text.", "verse_2_1")
                    .InsertPara("bad", true)),
                new ChapterDelta(3, 1, true, Delta.New()
                    .InsertChapter("3")
                    .InsertBlank("p_1")
                    .InsertVerse("1")
                    .InsertText("New verse text.", "verse_3_1")
                    .InsertPara("p"))
            };

            var oldUsxDoc = Usx("PHM",
                Para("imt", "Book title"),
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    "Old verse text."),
                Chapter("2"),
                Para("bad",
                    Verse("1"),
                    "Old verse text."),
                Chapter("3"),
                Para("p",
                    Verse("1"),
                    "Old verse text."));

            var mapper = new DeltaUsxMapper();
            XDocument newUsxDoc = mapper.ToUsx(oldUsxDoc, chapterDeltas);

            XDocument expected = Usx("PHM",
                Para("imt", "Book title"),
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    "New verse text."),
                Chapter("2"),
                Para("bad",
                    Verse("1"),
                    "Old verse text."),
                Chapter("3"),
                Para("p",
                    Verse("1"),
                    "New verse text."));
            Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
        }

        [Test]
        public void ToUsx_InvalidParaInLastChapter()
        {
            var chapterDeltas = new[]
            {
                new ChapterDelta(1, 1, true, Delta.New()
                    .InsertText("Book title", "imt_1")
                    .InsertPara("imt")
                    .InsertChapter("1")
                    .InsertBlank("p_1")
                    .InsertVerse("1")
                    .InsertText("New verse text.", "verse_1_1")
                    .InsertPara("p")),
                new ChapterDelta(2, 1, true, Delta.New()
                    .InsertChapter("2")
                    .InsertBlank("p_1")
                    .InsertVerse("1")
                    .InsertText("New verse text.", "verse_2_1")
                    .InsertPara("p")),
                new ChapterDelta(3, 1, false, Delta.New()
                    .InsertChapter("3")
                    .InsertBlank("bad_1")
                    .InsertVerse("1")
                    .InsertText("New verse text.", "verse_3_1")
                    .InsertPara("bad", true))
            };

            var oldUsxDoc = Usx("PHM",
                Para("imt", "Book title"),
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    "Old verse text."),
                Chapter("2"),
                Para("p",
                    Verse("1"),
                    "Old verse text."),
                Chapter("3"),
                Para("bad",
                    Verse("1"),
                    "Old verse text."));

            var mapper = new DeltaUsxMapper();
            XDocument newUsxDoc = mapper.ToUsx(oldUsxDoc, chapterDeltas);

            XDocument expected = Usx("PHM",
                Para("imt", "Book title"),
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    "New verse text."),
                Chapter("2"),
                Para("p",
                    Verse("1"),
                    "New verse text."),
                Chapter("3"),
                Para("bad",
                    Verse("1"),
                    "Old verse text."));
            Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
        }

        [Test]
        public void ToUsx_Unmatched()
        {
            var chapterDelta = new ChapterDelta(1, 1, true, Delta.New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("This is a verse with an unmatched marker", "verse_1_1")
                .InsertEmbed("unmatched", new JObject(new JProperty("marker", "bad")), "verse_1_1")
                .InsertPara("p")
                .Insert("\n"));

            var mapper = new DeltaUsxMapper();
            XDocument newUsxDoc = mapper.ToUsx(Usx("PHM"), new[] { chapterDelta });

            XDocument expected = Usx("PHM",
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    "This is a verse with an unmatched marker",
                    Unmatched("bad")));
            Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
        }

        [Test]
        public void ToUsx_InvalidChapterNumber()
        {
            var chapterDelta = new ChapterDelta(2, 2, true, Delta.New()
                .InsertChapter("2")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertBlank("verse_2_1")
                .InsertVerse("2")
                .InsertBlank("verse_2_2")
                .InsertPara("p"));

            XDocument oldUsxDoc = Usx("PHM",
                Chapter("bad"),
                Para("p",
                    Verse("1"),
                    Verse("2")),
                Chapter("2"));

            var mapper = new DeltaUsxMapper();
            XDocument newUsxDoc = mapper.ToUsx(oldUsxDoc, new[] { chapterDelta });

            XDocument expected = Usx("PHM",
                Chapter("bad"),
                Para("p",
                    Verse("1"),
                    Verse("2")),
                Chapter("2"),
                Para("p",
                    Verse("1"),
                    Verse("2")));
            Assert.IsTrue(XNode.DeepEquals(newUsxDoc, expected));
        }

        [Test]
        public void ToDelta_EmptySegments()
        {
            XDocument usxDoc = Usx("PHM",
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    Verse("2")),
                Para("li"),
                Para("li"),
                Para("p",
                    Verse("3")));

            var mapper = new DeltaUsxMapper();
            List<ChapterDelta> chapterDeltas = mapper.ToChapterDeltas(usxDoc).ToList();

            var expected = Delta.New()
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
            XDocument usxDoc = Usx("PHM",
                Chapter("bad"),
                Para("p",
                    Verse("1"),
                    Verse("2")),
                Chapter("2"),
                Para("p",
                    Verse("1"),
                    Verse("2")));

            var mapper = new DeltaUsxMapper();
            List<ChapterDelta> chapterDeltas = mapper.ToChapterDeltas(usxDoc).ToList();

            var expected = Delta.New()
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
            XDocument usxDoc = Usx("PHM",
                Chapter("1", "bad"),
                Para("p",
                    Verse("1"),
                    Verse("2")));

            var mapper = new DeltaUsxMapper();
            List<ChapterDelta> chapterDeltas = mapper.ToChapterDeltas(usxDoc).ToList();

            var expected = Delta.New()
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
            XDocument usxDoc = Usx("PHM",
                Chapter("1"),
                Para("p",
                    Verse("1", "bad"),
                    Verse("2")));

            var mapper = new DeltaUsxMapper();
            List<ChapterDelta> chapterDeltas = mapper.ToChapterDeltas(usxDoc).ToList();

            var expected = Delta.New()
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
        public void ToDelta_InvalidLastVerse()
        {
            XDocument usxDoc = Usx("PHM",
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    Verse("2bad")));

            var mapper = new DeltaUsxMapper();
            List<ChapterDelta> chapterDeltas = mapper.ToChapterDeltas(usxDoc).ToList();

            var expected = Delta.New()
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
            XDocument usxDoc = Usx("PHM",
                Para("mt", "Philemon"),
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    Verse("2")),
                Para("s"),
                Para("p",
                    Verse("3")),
                Chapter("2"),
                Para("p",
                    Verse("1"),
                    Verse("2")),
                Para("s"),
                Para("p",
                    Verse("3")));

            var mapper = new DeltaUsxMapper();
            List<ChapterDelta> chapterDeltas = mapper.ToChapterDeltas(usxDoc).ToList();

            var expectedChapter1 = Delta.New()
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

            var expectedChapter2 = Delta.New()
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
            XDocument usxDoc = Usx("PHM",
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    "This is a verse with a footnote",
                    Note("f", "+",
                        Char("fr", "1.1: "),
                        Char("ft", "Refers to "),
                        Char("fq", "a footnote"),
                        ". ",
                        Char("xt", "John 1:1"),
                        " and ",
                        Char("xt", "Mark 1:1")),
                    ", so that we can test it."));

            var mapper = new DeltaUsxMapper();
            List<ChapterDelta> chapterDeltas = mapper.ToChapterDeltas(usxDoc).ToList();

            var expected = Delta.New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("This is a verse with a footnote", "verse_1_1")
                .InsertNote(Delta.New()
                    .InsertChar("1.1: ", "fr")
                    .InsertChar("Refers to ", "ft")
                    .InsertChar("a footnote", "fq")
                    .Insert(". ")
                    .InsertChar("John 1:1", "xt")
                    .Insert(" and ")
                    .InsertChar("Mark 1:1", "xt"), "f", "+", "verse_1_1")
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
            XDocument usxDoc = Usx("PHM",
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    "This is a verse with a footnote",
                    Note("bad", "+",
                        Char("fr", "1.1: "),
                        Char("ft", "Refers to "),
                        Char("fq", "a footnote"),
                        ". ",
                        Char("xt", "John 1:1"),
                        " and ",
                        Char("xt", "Mark 1:1")),
                    ", so that we can test it."));

            var mapper = new DeltaUsxMapper();
            List<ChapterDelta> chapterDeltas = mapper.ToChapterDeltas(usxDoc).ToList();

            var expected = Delta.New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("This is a verse with a footnote", "verse_1_1")
                .InsertNote(Delta.New()
                    .InsertChar("1.1: ", "fr")
                    .InsertChar("Refers to ", "ft")
                    .InsertChar("a footnote", "fq")
                    .Insert(". ")
                    .InsertChar("John 1:1", "xt")
                    .Insert(" and ")
                    .InsertChar("Mark 1:1", "xt"), "bad", "+", "verse_1_1", true)
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
            XDocument usxDoc = Usx("PHM",
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    "This is a verse with a figure",
                    Figure("file.jpg", "col", "PHM 1:1", "Caption"),
                    ", so that we can test it."));

            var mapper = new DeltaUsxMapper();
            List<ChapterDelta> chapterDeltas = mapper.ToChapterDeltas(usxDoc).ToList();

            var expected = Delta.New()
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
            XDocument usxDoc = Usx("PHM",
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    "This is a verse with a figure",
                    Figure("file.jpg", "col", null, "Caption"),
                    ", so that we can test it."));

            var mapper = new DeltaUsxMapper();
            List<ChapterDelta> chapterDeltas = mapper.ToChapterDeltas(usxDoc).ToList();

            var expected = Delta.New()
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
        public void ToDelta_NestedChars()
        {
            XDocument usxDoc = Usx("PHM",
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    Char("bd",
                        Char("sup", "1"),
                        "This is",
                        Char("sup", "2"),
                        " bold text.",
                        Char("sup", "3")),
                    " This is normal text."));

            var mapper = new DeltaUsxMapper();
            List<ChapterDelta> chapterDeltas = mapper.ToChapterDeltas(usxDoc).ToList();

            var expected = Delta.New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertChar("1", new[] { "bd", "sup" }, "verse_1_1")
                .InsertChar("This is", "bd", "verse_1_1")
                .InsertChar("2", new[] { "bd", "sup" }, "verse_1_1")
                .InsertChar(" bold text.", "bd", "verse_1_1")
                .InsertChar("3", new[] { "bd", "sup" }, "verse_1_1")
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
            XDocument usxDoc = Usx("PHM",
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    Char("bad",
                        Char("sup", "1"),
                        "This is",
                        Char("sup", "2"),
                        " bold text.",
                        Char("sup", "3")),
                    " This is normal text."));

            var mapper = new DeltaUsxMapper();
            List<ChapterDelta> chapterDeltas = mapper.ToChapterDeltas(usxDoc).ToList();

            var expected = Delta.New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertChar("1", new[] { "bad", "sup" }, "verse_1_1", true)
                .InsertChar("This is", "bad", "verse_1_1", true)
                .InsertChar("2", new[] { "bad", "sup" }, "verse_1_1", true)
                .InsertChar(" bold text.", "bad", "verse_1_1", true)
                .InsertChar("3", new[] { "bad", "sup" }, "verse_1_1", true)
                .InsertText(" This is normal text.", "verse_1_1")
                .InsertPara("p");

            Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
            Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(1));
            Assert.That(chapterDeltas[0].IsValid, Is.False);
            Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
        }

        [Test]
        public void ToDelta_Ref()
        {
            XDocument usxDoc = Usx("PHM",
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    "This is a verse with a footnote",
                    Note("f", "+",
                        Char("fr", "1.1: "),
                        Char("ft", "Refers to "),
                        Char("fq", "a footnote"),
                        ". ",
                        Char("xt", Ref("JHN 1:1", "John 1:1")),
                        " and ",
                        Char("xt", Ref("MRK 1:1", "Mark 1:1")),
                        "."),
                    ", so that we can test it."));

            var mapper = new DeltaUsxMapper();
            List<ChapterDelta> chapterDeltas = mapper.ToChapterDeltas(usxDoc).ToList();

            var expected = Delta.New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("This is a verse with a footnote", "verse_1_1")
                .InsertNote(Delta.New()
                    .InsertChar("1.1: ", "fr")
                    .InsertChar("Refers to ", "ft")
                    .InsertChar("a footnote", "fq")
                    .Insert(". ")
                    .InsertCharRef("John 1:1", "xt", "JHN 1:1")
                    .Insert(" and ")
                    .InsertCharRef("Mark 1:1", "xt", "MRK 1:1")
                    .Insert("."), "f", "+", "verse_1_1")
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
            XDocument usxDoc = Usx("PHM",
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    "This is a verse with a footnote",
                    Note("f", "+",
                        Char("fr", "1.1: "),
                        Char("ft", "Refers to "),
                        Char("fq", "a footnote"),
                        ". ",
                        Char("xt", Ref("bad location", "John 1:1")),
                        " and ",
                        Char("xt", Ref("MRK 1:1", "Mark 1:1")),
                        "."),
                    ", so that we can test it."));

            var mapper = new DeltaUsxMapper();
            List<ChapterDelta> chapterDeltas = mapper.ToChapterDeltas(usxDoc).ToList();

            var expected = Delta.New()
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("This is a verse with a footnote", "verse_1_1")
                .InsertNote(Delta.New()
                    .InsertChar("1.1: ", "fr")
                    .InsertChar("Refers to ", "ft")
                    .InsertChar("a footnote", "fq")
                    .Insert(". ")
                    .InsertCharRef("John 1:1", "xt", "bad location", invalid: true)
                    .Insert(" and ")
                    .InsertCharRef("Mark 1:1", "xt", "MRK 1:1")
                    .Insert("."), "f", "+", "verse_1_1")
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
            XDocument usxDoc = Usx("PHM",
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    "This is a verse with a line break",
                    OptBreak(),
                    ", so that we can test it."));

            var mapper = new DeltaUsxMapper();
            List<ChapterDelta> chapterDeltas = mapper.ToChapterDeltas(usxDoc).ToList();

            var expected = Delta.New()
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
            XDocument usxDoc = Usx("PHM",
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    "This is a verse with a line break",
                    Milestone("ts"),
                    ", so that we can test it."));

            var mapper = new DeltaUsxMapper();
            List<ChapterDelta> chapterDeltas = mapper.ToChapterDeltas(usxDoc).ToList();

            var expected = Delta.New()
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
            XDocument usxDoc = Usx("PHM",
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    "This is a verse with a line break",
                    Milestone("bad"),
                    ", so that we can test it."));

            var mapper = new DeltaUsxMapper();
            List<ChapterDelta> chapterDeltas = mapper.ToChapterDeltas(usxDoc).ToList();

            var expected = Delta.New()
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
            XDocument usxDoc = Usx("PHM",
                Chapter("1"),
                Table(
                    Row(
                        Cell("tc1", "start", "Before verse.", Verse("1"), "This is verse ", Char("it", "1"), "."),
                        Cell("tc2", "start", Verse("2"), "This is verse 2.")),
                    Row(
                        Cell("tc1", "start"),
                        Cell("tc2", "start", Verse("3"), "This is verse 3."))));

            var mapper = new DeltaUsxMapper();
            List<ChapterDelta> chapterDeltas = mapper.ToChapterDeltas(usxDoc).ToList();

            var expected = Delta.New()
                .InsertChapter("1")
                .InsertText("Before verse.", "cell_1_1_1")
                .InsertVerse("1")
                .InsertText("This is verse ", "verse_1_1")
                .InsertChar("1", "it", "verse_1_1")
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
        }

        [Test]
        public void ToDelta_TableInMiddle()
        {
            XDocument usxDoc = Usx("PHM",
                Chapter("1"),
                Table(
                    Row(
                        Cell("tc1", "start", "Before verse.", Verse("1"), "This is verse ", Char("it", "1"), "."),
                        Cell("tc2", "start", Verse("2"), "This is verse 2.")),
                    Row(
                        Cell("tc1", "start"),
                        Cell("tc2", "start", Verse("3"), "This is verse 3."))),
                Para("p", Verse("4"), "This is verse 4."));

            var mapper = new DeltaUsxMapper();
            List<ChapterDelta> chapterDeltas = mapper.ToChapterDeltas(usxDoc).ToList();

            var expected = Delta.New()
                .InsertChapter("1")
                .InsertText("Before verse.", "cell_1_1_1")
                .InsertVerse("1")
                .InsertText("This is verse ", "verse_1_1")
                .InsertChar("1", "it", "verse_1_1")
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
        }

        [Test]
        public void ToDelta_AdjacentTables()
        {
            XDocument usxDoc = Usx("PHM",
                Chapter("1"),
                Table(
                    Row(
                        Cell("tc1", "start", Verse("1"), "This is verse 1."),
                        Cell("tc2", "start", Verse("2"), "This is verse 2.")),
                    Row(
                        Cell("tc1", "start", Verse("3"), "This is verse 3."),
                        Cell("tc2", "start", Verse("4"), "This is verse 4."))),
                Table(
                    Row(
                        Cell("tc1", "start", Verse("5"), "This is verse 5."),
                        Cell("tc2", "start", Verse("6"), "This is verse 6.")),
                    Row(
                        Cell("tc1", "start", Verse("7"), "This is verse 7."),
                        Cell("tc2", "start", Verse("8"), "This is verse 8."))));

            var mapper = new DeltaUsxMapper();
            List<ChapterDelta> chapterDeltas = mapper.ToChapterDeltas(usxDoc).ToList();

            var expected = Delta.New()
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
        }

        [Test]
        public void ToDelta_InvalidTable()
        {
            XDocument usxDoc = Usx("PHM",
                Chapter("1"),
                Table(
                    Row(
                        Cell("bad", "start", "Before verse.", Verse("1"), "This is verse ", Char("it", "1"), "."),
                        Cell("tc2", "start", Verse("2"), "This is verse 2.")),
                    Row(
                        Cell("tc1", "start"),
                        Cell("tc2", "start", Verse("3"), "This is verse 3."))));

            var mapper = new DeltaUsxMapper();
            List<ChapterDelta> chapterDeltas = mapper.ToChapterDeltas(usxDoc).ToList();

            var expected = Delta.New()
                .InsertChapter("1")
                .InsertText("Before verse.", "cell_1_1_1")
                .InsertVerse("1")
                .InsertText("This is verse ", "verse_1_1")
                .InsertChar("1", "it", "verse_1_1")
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
            XDocument usxDoc = Usx("PHM",
                Chapter("1"),
                Verse("1"),
                "This is verse 1.",
                Verse("2"),
                Verse("3"),
                "This is verse 3.",
                Chapter("2"),
                Verse("1"),
                Verse("2-3"));

            var mapper = new DeltaUsxMapper();
            List<ChapterDelta> chapterDeltas = mapper.ToChapterDeltas(usxDoc).ToList();

            var expected1 = Delta.New()
                .InsertChapter("1")
                .InsertVerse("1")
                .InsertText("This is verse 1.", "verse_1_1")
                .InsertVerse("2")
                .InsertBlank("verse_1_2")
                .InsertVerse("3")
                .InsertText("This is verse 3.", "verse_1_3")
                .Insert("\n");
            var expected2 = Delta.New()
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

            var mapper = new DeltaUsxMapper();
            List<ChapterDelta> chapterDeltas = mapper.ToChapterDeltas(usxDoc).ToList();

            Assert.That(chapterDeltas.Count, Is.EqualTo(1));
            Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
            Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(0));
            Assert.That(chapterDeltas[0].IsValid, Is.True);
            Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(new Delta()));
        }

        [Test]
        public void ToDelta_EmptyStyle()
        {
            XDocument usxDoc = Usx("PHM",
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    Verse("2")),
                Para(""),
                Para("li"),
                Para("",
                    Verse("3")));

            var mapper = new DeltaUsxMapper();
            List<ChapterDelta> chapterDeltas = mapper.ToChapterDeltas(usxDoc).ToList();

            var expected = Delta.New()
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
            XDocument usxDoc = Usx("PHM",
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    Verse("2")),
                Para("b"),
                Para("p",
                    Verse("3")));

            var mapper = new DeltaUsxMapper();
            List<ChapterDelta> chapterDeltas = mapper.ToChapterDeltas(usxDoc).ToList();

            var expected = Delta.New()
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
                .InsertPara("p");

            Assert.That(chapterDeltas[0].Number, Is.EqualTo(1));
            Assert.IsTrue(chapterDeltas[0].Delta.DeepEquals(expected));
            Assert.That(chapterDeltas[0].LastVerse, Is.EqualTo(3));
        }

        [Test]
        public void ToDelta_InvalidParaInFirstChapter()
        {
            XDocument usxDoc = Usx("PHM",
                Para("imt", "Book title"),
                Chapter("1"),
                Para("bad",
                    Verse("1"),
                    "Verse text."),
                Chapter("2"),
                Para("p",
                    Verse("1"),
                    "Verse text."),
                Chapter("3"),
                Para("p",
                    Verse("1"),
                    "Verse text."));

            var mapper = new DeltaUsxMapper();
            List<ChapterDelta> chapterDeltas = mapper.ToChapterDeltas(usxDoc).ToList();

            var expectedChapter1 = Delta.New()
                .InsertText("Book title", "imt_1")
                .InsertPara("imt")
                .InsertChapter("1")
                .InsertBlank("bad_1")
                .InsertVerse("1")
                .InsertText("Verse text.", "verse_1_1")
                .InsertPara("bad", true);
            var expectedChapter2 = Delta.New()
                .InsertChapter("2")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("Verse text.", "verse_2_1")
                .InsertPara("p");
            var expectedChapter3 = Delta.New()
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
            XDocument usxDoc = Usx("PHM",
                Para("imt", "Book title"),
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    "Verse text."),
                Chapter("2"),
                Para("bad",
                    Verse("1"),
                    "Verse text."),
                Chapter("3"),
                Para("p",
                    Verse("1"),
                    "Verse text."));

            var mapper = new DeltaUsxMapper();
            List<ChapterDelta> chapterDeltas = mapper.ToChapterDeltas(usxDoc).ToList();

            var expectedChapter1 = Delta.New()
                .InsertText("Book title", "imt_1")
                .InsertPara("imt")
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("Verse text.", "verse_1_1")
                .InsertPara("p");
            var expectedChapter2 = Delta.New()
                .InsertChapter("2")
                .InsertBlank("bad_1")
                .InsertVerse("1")
                .InsertText("Verse text.", "verse_2_1")
                .InsertPara("bad", true);
            var expectedChapter3 = Delta.New()
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
            XDocument usxDoc = Usx("PHM",
                Para("imt", "Book title"),
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    "Verse text."),
                Chapter("2"),
                Para("p",
                    Verse("1"),
                    "Verse text."),
                Chapter("3"),
                Para("bad",
                    Verse("1"),
                    "Verse text."));

            var mapper = new DeltaUsxMapper();
            List<ChapterDelta> chapterDeltas = mapper.ToChapterDeltas(usxDoc).ToList();

            var expectedChapter1 = Delta.New()
                .InsertText("Book title", "imt_1")
                .InsertPara("imt")
                .InsertChapter("1")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("Verse text.", "verse_1_1")
                .InsertPara("p");
            var expectedChapter2 = Delta.New()
                .InsertChapter("2")
                .InsertBlank("p_1")
                .InsertVerse("1")
                .InsertText("Verse text.", "verse_2_1")
                .InsertPara("p");
            var expectedChapter3 = Delta.New()
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
        public void ToDelta_Unmatched()
        {
            XDocument usxDoc = Usx("PHM",
                Chapter("1"),
                Para("p",
                    Verse("1"),
                    "This is a verse with an unmatched marker",
                    Unmatched("bad")));

            var mapper = new DeltaUsxMapper();
            List<ChapterDelta> chapterDeltas = mapper.ToChapterDeltas(usxDoc).ToList();

            var expected = Delta.New()
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

        private static XDocument Usx(string code, params object[] elems)
        {
            return new XDocument(new XElement("usx", new XAttribute("version", "2.5"), Book(code), elems));
        }

        private static XElement Book(string code)
        {
            return new XElement("book", new XAttribute("code", code), new XAttribute("style", "id"));
        }

        private static XElement Para(string style, params object[] contents)
        {
            var elem = new XElement("para", new XAttribute("style", style), contents);
            if (style == "")
                elem.Add(new XAttribute("status", "unknown"));
            return elem;
        }

        private static XElement Chapter(string number, string style = "c")
        {
            return new XElement("chapter", new XAttribute("number", number), new XAttribute("style", style));
        }

        private static XElement Verse(string number, string style = "v")
        {
            return new XElement("verse", new XAttribute("number", number), new XAttribute("style", style));
        }

        private static XElement Char(string style, params object[] contents)
        {
            return new XElement("char", new XAttribute("style", style), contents);
        }

        private static XElement Ref(string loc, string text)
        {
            return new XElement("ref", new XAttribute("loc", loc), text);
        }

        private static XElement Note(string style, string caller, params object[] contents)
        {
            return new XElement("note", new XAttribute("style", style), new XAttribute("caller", caller), contents);
        }

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

        private static XElement OptBreak()
        {
            return new XElement("optbreak");
        }

        private static XElement Milestone(string style)
        {
            return new XElement("ms", new XAttribute("style", style));
        }

        private static XElement Table(params object[] contents)
        {
            return new XElement("table", contents);
        }

        private static XElement Row(params object[] contents)
        {
            return new XElement("row", new XAttribute("style", "tr"), contents);
        }

        private static XElement Cell(string style, string align, params object[] contents)
        {
            return new XElement("cell", new XAttribute("style", style), new XAttribute("align", align), contents);
        }

        private static XElement Unmatched(string marker)
        {
            return new XElement("unmatched", new XAttribute("marker", marker));
        }
    }
}
