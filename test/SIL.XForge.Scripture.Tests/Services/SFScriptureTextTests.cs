using System;
using System.Linq;
using MongoDB.Bson;
using NUnit.Framework;
using SIL.Machine.Tokenization;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class SFScriptureTextTests
{
    private const string Id = "abc123:MAT:1:target";

    [Test]
    public void Create_HasDocOps_HasSegments()
    {
        // Make a BsonDocument that looks like data
        // from SF DB - xforge - texts.
        var doc = new BsonDocument
        {
            { "_id", Id },
            {
                "ops",
                new BsonArray { ChapterMarker, VerseMarker, VerseSegment }
            },
        };
        const int numberOps = 3;
        const int numberSegments = 1;
        const int bookNumber = 40;
        const int chapterNumber = 1;
        const string projectId = "myProject";
        Assert.That(((BsonArray)doc["ops"]).Count, Is.EqualTo(numberOps), "Setup");
        var tokenizer = new LatinWordTokenizer();

        // SUT
        var text = new SFScriptureText(
            tokenizer,
            projectId,
            bookNumber,
            chapterNumber,
            preTranslate: false,
            doNotSendSegmentText: false,
            doc
        );

        Assert.That(text.Id, Is.EqualTo($"{projectId}_{bookNumber}_{chapterNumber}"));
        Assert.That(text.GetSegments().Count(), Is.EqualTo(numberSegments));
    }

    [Test]
    public void Create_NoSegments_EmptySegments()
    {
        var doc = new BsonDocument
        {
            { "_id", Id },
            {
                "ops",
                new BsonArray
                {
                    ChapterMarker,
                    VerseMarker,
                    // No verse text inserts with a segment reference.
                }
            },
        };
        const int numberOps = 2;
        const int numberSegments = 0;
        const int bookNumber = 40;
        const int chapterNumber = 1;
        const string projectId = "myProject";
        Assert.That(((BsonArray)doc["ops"]).Count, Is.EqualTo(numberOps), "Setup");
        var tokenizer = new LatinWordTokenizer();

        // SUT
        var text = new SFScriptureText(
            tokenizer,
            projectId,
            bookNumber,
            chapterNumber,
            preTranslate: false,
            doNotSendSegmentText: false,
            doc
        );

        Assert.That(text.Id, Is.EqualTo($"{projectId}_{bookNumber}_{chapterNumber}"));
        Assert.That(text.GetSegments().Count(), Is.EqualTo(numberSegments));
    }

    [Test]
    public void Create_EmptyOps_EmptySegments()
    {
        var doc = new BsonDocument
        {
            { "_id", Id },
            {
                "ops",
                new BsonArray
                {
                    // Empty ops array
                }
            },
        };
        const int numberOps = 0;
        const int numberSegments = 0;
        const int bookNumber = 40;
        const int chapterNumber = 1;
        const string projectId = "myProject";
        Assert.That(((BsonArray)doc["ops"]).Count, Is.EqualTo(numberOps), "Setup");
        var tokenizer = new LatinWordTokenizer();

        // SUT
        var text = new SFScriptureText(
            tokenizer,
            projectId,
            bookNumber,
            chapterNumber,
            preTranslate: false,
            doNotSendSegmentText: false,
            doc
        );

        Assert.That(text.Id, Is.EqualTo($"{projectId}_{bookNumber}_{chapterNumber}"));
        Assert.That(text.GetSegments().Count(), Is.EqualTo(numberSegments));
    }

    [Test]
    public void Create_NullDoc_Crash()
    {
        const int bookNumber = 40;
        const int chapterNumber = 1;
        const string projectId = "myProject";
        var tokenizer = new LatinWordTokenizer();

        // SUT
        Assert.Throws<ArgumentNullException>(
            () =>
                new SFScriptureText(
                    tokenizer,
                    projectId,
                    bookNumber,
                    chapterNumber,
                    preTranslate: false,
                    doNotSendSegmentText: false,
                    doc: null
                )
        );
    }

    [Test]
    public void Create_MissingOps_Crash()
    {
        var doc = new BsonDocument
        {
            { "_id", Id },
            // Missing ops
        };
        const int bookNumber = 40;
        const int chapterNumber = 1;
        const string projectId = "myProject";
        Assert.That(doc.Contains("ops"), Is.False, "Setup");
        var tokenizer = new LatinWordTokenizer();

        // SUT
        Assert.Throws<ArgumentException>(
            () =>
                new SFScriptureText(
                    tokenizer,
                    projectId,
                    bookNumber,
                    chapterNumber,
                    preTranslate: false,
                    doNotSendSegmentText: false,
                    doc
                )
        );
    }

    [Test]
    public void Create_ExcludeBlankSegmentsIfPreTranslateFalse()
    {
        var doc = new BsonDocument
        {
            { "_id", Id },
            {
                "ops",
                new BsonArray { ChapterMarker, VerseMarker, BlankSegment }
            },
        };
        const int numberOps = 3;
        const int numberSegments = 0;
        const int bookNumber = 40;
        const int chapterNumber = 1;
        const string projectId = "myProject";
        Assert.That(((BsonArray)doc["ops"]).Count, Is.EqualTo(numberOps), "Setup");
        var tokenizer = new LatinWordTokenizer();

        // SUT
        var text = new SFScriptureText(
            tokenizer,
            projectId,
            bookNumber,
            chapterNumber,
            preTranslate: false,
            doNotSendSegmentText: false,
            doc
        );

        Assert.That(text.Id, Is.EqualTo($"{projectId}_{bookNumber}_{chapterNumber}"));
        Assert.That(text.GetSegments().Count(), Is.EqualTo(numberSegments));
    }

    [Test]
    public void Create_IncludeBlankSegmentsIfPreTranslateTrue()
    {
        var doc = new BsonDocument
        {
            { "_id", Id },
            {
                "ops",
                new BsonArray { ChapterMarker, VerseMarker, BlankSegment }
            },
        };
        const int numberOps = 3;
        const int numberSegments = 1;
        const int bookNumber = 40;
        const int chapterNumber = 1;
        const string projectId = "myProject";
        Assert.That(((BsonArray)doc["ops"]).Count, Is.EqualTo(numberOps), "Setup");
        var tokenizer = new LatinWordTokenizer();

        // SUT
        var text = new SFScriptureText(
            tokenizer,
            projectId,
            bookNumber,
            chapterNumber,
            preTranslate: true,
            doNotSendSegmentText: false,
            doc
        );

        Assert.That(text.Id, Is.EqualTo($"{projectId}_{bookNumber}_{chapterNumber}"));
        Assert.That(text.GetSegments().Count(), Is.EqualTo(numberSegments));
    }

    [Test]
    public void Create_ExcludeNonScriptureSegmentsIfPreTranslateFalse()
    {
        var doc = new BsonDocument
        {
            { "_id", Id },
            {
                "ops",
                new BsonArray { HeadingSegment, ChapterMarker, VerseMarker, VerseSegment }
            },
        };
        const int numberOps = 4;
        const int numberSegments = 2; // The heading and the verse text
        const int bookNumber = 40;
        const int chapterNumber = 1;
        const string projectId = "myProject";
        Assert.That(((BsonArray)doc["ops"]).Count, Is.EqualTo(numberOps), "Setup");
        var tokenizer = new LatinWordTokenizer();

        // SUT
        var text = new SFScriptureText(
            tokenizer,
            projectId,
            bookNumber,
            chapterNumber,
            preTranslate: false,
            doNotSendSegmentText: false,
            doc
        );

        Assert.That(text.Id, Is.EqualTo($"{projectId}_{bookNumber}_{chapterNumber}"));
        Assert.That(text.GetSegments().Count(), Is.EqualTo(numberSegments));
    }

    [Test]
    public void Create_ExcludeNonScriptureSegmentsIfPreTranslateTrue()
    {
        var doc = new BsonDocument
        {
            { "_id", Id },
            {
                "ops",
                new BsonArray { HeadingSegment, ChapterMarker, VerseMarker, VerseSegment }
            },
        };
        const int numberOps = 4;
        const int numberSegments = 1; // Just the verse text
        const int bookNumber = 40;
        const int chapterNumber = 1;
        const string projectId = "myProject";
        Assert.That(((BsonArray)doc["ops"]).Count, Is.EqualTo(numberOps), "Setup");
        var tokenizer = new LatinWordTokenizer();

        // SUT
        var text = new SFScriptureText(
            tokenizer,
            projectId,
            bookNumber,
            chapterNumber,
            preTranslate: true,
            doNotSendSegmentText: false,
            doc
        );

        Assert.That(text.Id, Is.EqualTo($"{projectId}_{bookNumber}_{chapterNumber}"));
        Assert.That(text.GetSegments().Count(), Is.EqualTo(numberSegments));
    }

    [Test]
    public void Create_IncludeVerseStyleSegmentsSeparately()
    {
        var doc = new BsonDocument
        {
            { "_id", Id },
            {
                "ops",
                new BsonArray { ChapterMarker, VerseMarker, VerseSegment, VerseParagraph }
            },
        };
        const int numberOps = 4;
        const int numberSegments = 2; // The verse text and the paragraph in the verse
        const int bookNumber = 40;
        const int chapterNumber = 1;
        const string projectId = "myProject";
        Assert.That(((BsonArray)doc["ops"]).Count, Is.EqualTo(numberOps), "Setup");
        var tokenizer = new LatinWordTokenizer();

        // SUT
        var text = new SFScriptureText(
            tokenizer,
            projectId,
            bookNumber,
            chapterNumber,
            preTranslate: true,
            doNotSendSegmentText: false,
            doc
        );

        Assert.That(text.Id, Is.EqualTo($"{projectId}_{bookNumber}_{chapterNumber}"));
        Assert.That(text.GetSegments().Count(), Is.EqualTo(numberSegments));
    }

    [Test]
    public void Create_SendBlankSegmentsIfDoNotSendSegmentTextTrue()
    {
        var doc = new BsonDocument
        {
            { "_id", Id },
            {
                "ops",
                new BsonArray { HeadingSegment, ChapterMarker, VerseMarker, VerseSegment }
            },
        };
        const int numberOps = 4;
        const int numberSegments = 1; // Just the verse text
        const int bookNumber = 40;
        const int chapterNumber = 1;
        const string projectId = "myProject";
        Assert.That(((BsonArray)doc["ops"]).Count, Is.EqualTo(numberOps), "Setup");
        var tokenizer = new LatinWordTokenizer();

        // SUT
        var text = new SFScriptureText(
            tokenizer,
            projectId,
            bookNumber,
            chapterNumber,
            preTranslate: true,
            doNotSendSegmentText: true,
            doc
        );

        Assert.That(text.Id, Is.EqualTo($"{projectId}_{bookNumber}_{chapterNumber}"));
        Assert.That(text.Segments.Count(), Is.EqualTo(numberSegments));
        Assert.That(text.Segments.First().SegmentText, Is.EqualTo(string.Empty));
    }

    [Test]
    public void Create_SendVerseTextIfDoNotSendSegmentTextFalse()
    {
        var doc = new BsonDocument
        {
            { "_id", Id },
            {
                "ops",
                new BsonArray { HeadingSegment, ChapterMarker, VerseMarker, VerseSegment }
            },
        };
        const int numberOps = 4;
        const int numberSegments = 1; // Just the verse text
        const int bookNumber = 40;
        const int chapterNumber = 1;
        const string projectId = "myProject";
        Assert.That(((BsonArray)doc["ops"]).Count, Is.EqualTo(numberOps), "Setup");
        var tokenizer = new LatinWordTokenizer();

        // SUT
        var text = new SFScriptureText(
            tokenizer,
            projectId,
            bookNumber,
            chapterNumber,
            preTranslate: true,
            doNotSendSegmentText: false,
            doc
        );

        Assert.That(text.Id, Is.EqualTo($"{projectId}_{bookNumber}_{chapterNumber}"));
        Assert.That(text.Segments.Count(), Is.EqualTo(numberSegments));
        Assert.That(text.Segments.First().SegmentText, Is.EqualTo("First verse text here"));
    }

    private static readonly BsonDocument BlankSegment = new BsonDocument
    {
        {
            "insert",
            new BsonDocument { { "blank", true } }
        },
        {
            "attributes",
            new BsonDocument { { "segment", "verse_1_1" } }
        },
    };

    private static readonly BsonDocument ChapterMarker = new BsonDocument
    {
        {
            "insert",
            new BsonDocument
            {
                {
                    "chapter",
                    new BsonDocument { { "number", "1" }, { "style", "c" } }
                },
            }
        },
    };

    private static readonly BsonDocument HeadingSegment = new BsonDocument
    {
        { "insert", "Heading Goes Here" },
        {
            "attributes",
            new BsonDocument { { "segment", "mt1_1" } }
        },
    };

    private static readonly BsonDocument VerseMarker = new BsonDocument
    {
        {
            "insert",
            new BsonDocument
            {
                {
                    "verse",
                    new BsonDocument { { "number", "1" }, { "style", "v" } }
                },
            }
        },
    };

    private static readonly BsonDocument VerseParagraph = new BsonDocument
    {
        { "insert", "First verse paragraph here" },
        {
            "attributes",
            new BsonDocument { { "segment", "verse_1_1/p_1" } }
        },
    };

    private static readonly BsonDocument VerseSegment = new BsonDocument
    {
        { "insert", "First verse text here" },
        {
            "attributes",
            new BsonDocument { { "segment", "verse_1_1" } }
        },
    };
}
