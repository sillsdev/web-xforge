using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using MongoDB.Bson;
using MongoDB.Driver;
using SIL.Scripture;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Calculates translation progress by aggregating verse data from the MongoDB texts collection. Alongside the counts
/// of verse units found in the text documents, the result carries the verse counts the project's versification
/// expects per book and per chapter, so that consumers can size the chapters that are missing from the project.
///
/// DATA CONTRACT: This pipeline reads the delta representation that <see cref="DeltaUsxMapper"/> writes to text
/// documents ("{projectId}:{bookId}:{chapter}:target"), and depends on these properties of that representation:
/// - Each op that is part of a segment carries the segment reference in attributes.segment. A segment can span
///   multiple ops (e.g. text with character styling, or a footnote embed in the middle of a verse).
/// - Verse segments have refs of the form "verse_{chapter}_{verse}". When a verse continues past a paragraph or
///   poetry-line break, the following segments get suffixed refs such as "verse_1_8/p_1" or "verse_1_8/q2_1".
/// - Translated text is written as string ops. Everything else in a segment is an embed whose insert is an object:
///   the {blank: true} placeholder for a segment with no text, the {empty: true} placeholder for a textless inline
///   element, and the note, figure, milestone and similar embeds for USX elements that are not Scripture text.
///   Continuation segments are routinely and legitimately blank: a paragraph that opens with a verse number still
///   produces a blank continuation segment for the previous verse (e.g. "verse_1_2/p_1" between the paragraph start
///   and the "\v 3" marker), and "\b" (blank line) must be empty by the USFM spec.
///
/// Because of the last point, counting blank segments overstates missing content. Instead, this pipeline groups
/// segments into verse units by stripping the "/..." continuation suffix, and counts a verse unit as blank only
/// when none of its ops is a string. Notes are deliberately not content: footnotes and cross references are
/// apparatus rather than translated text, and projects commonly carry cross references imported from another
/// project into verses that have not been translated yet. A verse unit never spans chapters (text documents are per
/// chapter), so this grouping happens with array operators inside each document rather than by unwinding the ops
/// array, keeping the pipeline's intermediate stream at one document per chapter instead of one per op.
///
/// Known limitation: a heading paragraph (or any other paragraph that cannot contain verse text) in the middle of a
/// verse resets the mapper's current segment, so the text after it belongs to a plain paragraph segment rather than
/// a verse continuation and is invisible here. The verse is only miscounted when all of its text follows the heading,
/// which is rare, and progress is an approximation anyway, so this is accepted rather than worked around.
///
/// Tests for this class must generate their text document fixtures by running <see cref="DeltaUsxMapper"/> over
/// USX, not by hand-writing ops JSON, so that they fail if the mapper's representation drifts from the
/// assumptions above.
/// </summary>
public class TextProgressService(IMongoDatabase database, IRealtimeService realtimeService) : ITextProgressService
{
    public async Task<BookProgress[]> GetBookProgressAsync(string projectId, ScrVers versification)
    {
        // For each op of a verse segment: the verse unit it belongs to (segment ref without the "/..."
        // continuation suffix) and whether the op holds content
        var verseOpUnits = new BsonDocument(
            "$map",
            new BsonDocument
            {
                {
                    "input",
                    new BsonDocument(
                        "$filter",
                        new BsonDocument
                        {
                            { "input", "$ops" },
                            { "as", "op" },
                            {
                                // Compares the leading characters of the segment ref with the verse prefix. This
                                // runs once per op, and a substring comparison measured about 10% faster for the
                                // whole pipeline than an anchored $regexMatch on a heavily fragmented full Bible.
                                "cond",
                                new BsonDocument(
                                    "$eq",
                                    new BsonArray
                                    {
                                        new BsonDocument(
                                            "$substrCP",
                                            new BsonArray
                                            {
                                                new BsonDocument(
                                                    "$ifNull",
                                                    new BsonArray { "$$op.attributes.segment", "" }
                                                ),
                                                0,
                                                DeltaUsxMapper.VerseSegmentPrefix.Length,
                                            }
                                        ),
                                        DeltaUsxMapper.VerseSegmentPrefix,
                                    }
                                )
                            },
                        }
                    )
                },
                { "as", "op" },
                {
                    "in",
                    new BsonDocument
                    {
                        {
                            "unit",
                            new BsonDocument(
                                "$arrayElemAt",
                                new BsonArray
                                {
                                    new BsonDocument(
                                        "$split",
                                        new BsonArray
                                        {
                                            "$$op.attributes.segment",
                                            DeltaUsxMapper.SegmentContinuationSeparator,
                                        }
                                    ),
                                    0,
                                }
                            )
                        },
                        {
                            // Translated text is always a string op; every object insert is a placeholder or an
                            // embed such as a note, figure or milestone (see the class comment)
                            "hasContent",
                            new BsonDocument(
                                "$eq",
                                new BsonArray { new BsonDocument("$type", "$$op.insert"), "string" }
                            )
                        },
                    }
                },
            }
        );

        List<BsonDocument> results = await database
            .GetCollection<BsonDocument>(realtimeService.GetCollectionName<TextData>())
            .Aggregate()
            // Text documents that belong to the specified project and have an ops array
            .Match(
                Builders<BsonDocument>.Filter.And(
                    Builders<BsonDocument>.Filter.Regex(
                        "_id",
                        new BsonRegularExpression($"^{Regex.Escape(projectId)}:")
                    ),
                    Builders<BsonDocument>.Filter.Exists("ops", true),
                    Builders<BsonDocument>.Filter.Ne("ops", BsonNull.Value)
                )
            )
            // Split the document ID ("{projectId}:{bookId}:{chapter}:target") and reduce the ops to their verse
            // units
            .Project(
                new BsonDocument
                {
                    { "idParts", new BsonDocument("$split", new BsonArray { "$_id", ":" }) },
                    { "units", verseOpUnits },
                }
            )
            // The chapter's distinct verse units, and the subset that is translated: a verse unit is translated
            // if any of its segments (across all of its ops) has content
            .Project(
                new BsonDocument
                {
                    { "book", new BsonDocument("$arrayElemAt", new BsonArray { "$idParts", 1 }) },
                    { "chapter", new BsonDocument("$arrayElemAt", new BsonArray { "$idParts", 2 }) },
                    { "verseUnits", new BsonDocument("$setUnion", new BsonArray { "$units.unit" }) },
                    {
                        "translatedUnits",
                        new BsonDocument(
                            "$setUnion",
                            new BsonArray
                            {
                                new BsonDocument(
                                    "$map",
                                    new BsonDocument
                                    {
                                        {
                                            "input",
                                            new BsonDocument(
                                                "$filter",
                                                new BsonDocument
                                                {
                                                    { "input", "$units" },
                                                    { "as", "unit" },
                                                    { "cond", "$$unit.hasContent" },
                                                }
                                            )
                                        },
                                        { "as", "unit" },
                                        { "in", "$$unit.unit" },
                                    }
                                ),
                            }
                        )
                    },
                }
            )
            // Total and blank verse-unit counts per chapter
            .Project(
                new BsonDocument
                {
                    { "book", 1 },
                    { "chapter", 1 },
                    { "verses", new BsonDocument("$size", "$verseUnits") },
                    {
                        "blankVerses",
                        new BsonDocument(
                            "$size",
                            new BsonDocument("$setDifference", new BsonArray { "$verseUnits", "$translatedUnits" })
                        )
                    },
                }
            )
            // Roll the chapter counts up per book, keeping the chapter breakdown. Chapters with no verse segments
            // (e.g. heading-only chapters) are kept, with zero counts: consumers rely on every existing chapter
            // being present to distinguish "exists but empty" from "does not exist".
            .Group(
                new BsonDocument
                {
                    { "_id", "$book" },
                    { "verses", new BsonDocument("$sum", "$verses") },
                    { "blankVerses", new BsonDocument("$sum", "$blankVerses") },
                    {
                        "chapters",
                        new BsonDocument(
                            "$push",
                            new BsonDocument
                            {
                                { "chapterNumber", "$chapter" },
                                { "verses", "$verses" },
                                { "blankVerses", "$blankVerses" },
                            }
                        )
                    },
                }
            )
            .ToListAsync();

        return
        [
            .. results.Select(doc =>
            {
                string bookId = doc["_id"].AsString;
                int bookNum = Canon.BookIdToNumber(bookId);
                return new BookProgress
                {
                    BookId = bookId,
                    Verses = doc["verses"].AsInt32,
                    BlankVerses = doc["blankVerses"].AsInt32,
                    ExpectedVerses = ExpectedVersesInBook(versification, bookNum),
                    Chapters =
                    [
                        .. doc["chapters"]
                            .AsBsonArray.Select(chapterDoc =>
                            {
                                int chapterNumber = int.Parse(chapterDoc["chapterNumber"].AsString);
                                return new ChapterProgress
                                {
                                    ChapterNumber = chapterNumber,
                                    Verses = chapterDoc["verses"].AsInt32,
                                    BlankVerses = chapterDoc["blankVerses"].AsInt32,
                                    ExpectedVerses = ExpectedVersesInChapter(versification, bookNum, chapterNumber),
                                };
                            })
                            .OrderBy(chapter => chapter.ChapterNumber),
                    ],
                };
            }),
        ];
    }

    /// <summary>
    /// The number of verses the versification has in a chapter, or zero for a book or chapter it does not know
    /// (bookNum is zero for an unrecognised book id).
    /// </summary>
    private static int ExpectedVersesInChapter(ScrVers versification, int bookNum, int chapterNumber) =>
        bookNum > 0 && chapterNumber >= 1 && chapterNumber <= versification.GetLastChapter(bookNum)
            ? versification.GetLastVerse(bookNum, chapterNumber)
            : 0;

    private static int ExpectedVersesInBook(ScrVers versification, int bookNum) =>
        bookNum > 0
            ? Enumerable
                .Range(1, versification.GetLastChapter(bookNum))
                .Sum(chapterNumber => versification.GetLastVerse(bookNum, chapterNumber))
            : 0;
}
