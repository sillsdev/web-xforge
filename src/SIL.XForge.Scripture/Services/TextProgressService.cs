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
/// Calculates translation progress by aggregating verse data from the MongoDB texts collection. Alongside the counts of
/// verse units found in the text documents, the result carries the verse counts the project's versification expects per
/// book and per chapter, so that consumers can count chapters missing from the project as untranslated.
///
/// DATA CONTRACT: This pipeline reads the delta representation that <see cref="DeltaUsxMapper"/> writes to text
/// documents ("{projectId}:{bookId}:{chapter}:target"), and depends on these properties of that representation:
/// - Each op that is part of a segment carries the segment reference in attributes.segment. A segment can span multiple
///   ops (e.g. text with character styling, or a footnote embed in the middle of a verse).
/// - Verse segments have refs of the form "verse_{chapter}_{verse}". When a verse continues past a paragraph or
///   poetry-line break, the following segments get suffixed refs such as "verse_1_8/p_1" or "verse_1_8/q2_1".
/// - Translated text is written as string ops. Everything else in a segment is an embed whose insert is an object,
///   which is the {blank: true} placeholder for a segment with no text, the {empty: true} placeholder for a textless
///   inline element, or a note, figure, milestone or similar embed for a USX element that is not Scripture text.
///
/// The pipeline also allows for two things that are normal in these documents:
/// - Whitespace-only string ops. Paratext keeps the whitespace between an inline element and the next verse marker,
///   such as the space in "\f + \ft A note.\f* \v 2", and it is written as a string op in the verse. So a verse that
///   holds only a note, figure, milestone or similar still has a string op, made of whitespace.
/// - Blank continuation segments. A paragraph that opens with a verse number still produces a blank continuation
///   segment for the previous verse (e.g. "verse_1_2/p_1" between the paragraph start and the "\v 3" marker), and "\b"
///   (blank line) must be empty by the USFM spec.
///
/// Because continuation segments are often blank, counting blank segments overstates missing content. Instead, this
/// pipeline groups segments into verse units by stripping the "/..." continuation suffix, and counts a verse unit as
/// blank only when none of its ops is a string with something other than whitespace in it. Notes are deliberately not
/// content, because footnotes and cross references are not the translated text, and projects commonly carry cross
/// references imported from another project into verses that have not been translated yet. A verse unit never spans
/// chapters (text documents are per chapter), so this grouping happens with array operators inside each document rather
/// than by unwinding the ops array, keeping the pipeline's intermediate stream at one document per chapter instead of
/// one per op.
///
/// One known limitation is that a heading paragraph (or any other paragraph that cannot contain verse text) in the
/// middle of a verse resets the mapper's current segment, so the text after it belongs to a plain paragraph segment
/// rather than a verse continuation and is invisible here. The verse is only miscounted when all of its text follows
/// the heading, which is rare, and progress is an approximation anyway, so this is acceptable.
/// </summary>
public class TextProgressService(IMongoDatabase database, IRealtimeService realtimeService) : ITextProgressService
{
    // The pipeline stages are written as JSON, which is easier to read than nested BsonDocument constructors. Defining
    // them as constants guarantees that no user-controlled data is interpolated into them, because C# requires every
    // part of a constant interpolated string to be a constant. The one runtime value, the project ID, is applied
    // through the typed filter builder in GetBookProgressAsync.

    /// <summary>
    /// Maps the ops of a document's verse segments to the verse unit each belongs to (the segment ref without its
    /// "/..." continuation suffix) and whether the op holds content, i.e. is a string op with something other than
    /// whitespace in it (see the class comment). The type check comes first because $trim fails on an embed.
    ///
    /// Verse segments are recognised by comparing the start of the segment ref with the verse prefix, not with an
    /// anchored $regexMatch: the test runs once per op, and the comparison made the whole pipeline about 10% faster on
    /// a heavily fragmented full Bible.
    ///
    /// For the text of verse 8, verse 8's blank continuation segment after a paragraph break, and an empty verse 9, the
    /// result is:
    /// [{ "unit": "verse_1_8", "hasContent": true }, { "unit": "verse_1_8", "hasContent": false },
    /// { "unit": "verse_1_9", "hasContent": false }]
    /// </summary>
    private const string VerseOpUnits = """
        {
          "$map": {
            "input": {
              "$filter": {
                "input": "$ops",
                "as": "op",
                "cond": {
                  "$eq": [
                    {
                      "$substrCP": [
                        { "$ifNull": ["$$op.attributes.segment", ""] },
                        0,
                        { "$strLenCP": "verse_" }
                      ]
                    },
                    "verse_"
                  ]
                }
              }
            },
            "as": "op",
            "in": {
              "unit": { "$arrayElemAt": [{ "$split": ["$$op.attributes.segment", "/"] }, 0] },
              "hasContent": {
                "$cond": [
                  { "$eq": [{ "$type": "$$op.insert" }, "string"] },
                  { "$ne": [{ "$trim": { "input": "$$op.insert" } }, ""] },
                  false
                ]
              }
            }
          }
        }
        """;

    /// <summary>
    /// Splits the document ID ("{projectId}:{bookId}:{chapter}:target") and reduces the ops to their verse units:
    /// { "idParts": ["project01", "RUT", "1", "target"], "units": [...] } (see <see cref="VerseOpUnits"/>).
    /// </summary>
    private const string VerseUnitsStage = $$"""
        {
          "idParts": { "$split": ["$_id", ":"] },
          "units": {{VerseOpUnits}}
        }
        """;

    /// <summary>
    /// The chapter's distinct verse units, and the subset considered translated. A verse unit is translated if any of
    /// its segments (across all of its ops) has content. For the example in <see cref="VerseOpUnits"/>:
    /// { "book": "RUT", "chapter": "1", "verseUnits": ["verse_1_8", "verse_1_9"], "translatedUnits": ["verse_1_8"] }
    /// </summary>
    private const string DistinctVerseUnitsStage = """
        {
          "book": { "$arrayElemAt": ["$idParts", 1] },
          "chapter": { "$arrayElemAt": ["$idParts", 2] },
          "verseUnits": { "$setUnion": ["$units.unit"] },
          "translatedUnits": {
            "$setUnion": [
              {
                "$map": {
                  "input": { "$filter": { "input": "$units", "as": "unit", "cond": "$$unit.hasContent" } },
                  "as": "unit",
                  "in": "$$unit.unit"
                }
              }
            ]
          }
        }
        """;

    /// <summary>
    /// Total and blank verse-unit counts per chapter. For the example in <see cref="VerseOpUnits"/>:
    /// { "book": "RUT", "chapter": "1", "verses": 2, "blankVerses": 1 }
    /// </summary>
    private const string ChapterCountsStage = """
        {
          "book": 1,
          "chapter": 1,
          "verses": { "$size": "$verseUnits" },
          "blankVerses": { "$size": { "$setDifference": ["$verseUnits", "$translatedUnits"] } }
        }
        """;

    /// <summary>
    /// Rolls the chapter counts up per book, keeping the chapter breakdown:
    /// { "_id": "RUT", "verses": 2, "blankVerses": 1,
    ///   "chapters": [{ "chapterNumber": "1", "verses": 2, "blankVerses": 1 }] }
    /// Chapters with no verse segments (e.g. heading-only chapters) are kept, with zero counts, because consumers rely
    /// on every existing chapter being present to distinguish "exists but empty" from "does not exist".
    /// </summary>
    private const string BookCountsStage = """
        {
          "_id": "$book",
          "verses": { "$sum": "$verses" },
          "blankVerses": { "$sum": "$blankVerses" },
          "chapters": {
            "$push": { "chapterNumber": "$chapter", "verses": "$verses", "blankVerses": "$blankVerses" }
          }
        }
        """;

    public async Task<BookProgress[]> GetBookProgressAsync(string projectId, ScrVers versification)
    {
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
            .Project(BsonDocument.Parse(VerseUnitsStage))
            .Project(BsonDocument.Parse(DistinctVerseUnitsStage))
            .Project(BsonDocument.Parse(ChapterCountsStage))
            .Group(BsonDocument.Parse(BookCountsStage))
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
    /// The number of verses the versification has in a chapter, or zero for a chapter it does not have or a book it
    /// does not describe (see <see cref="ExpectedVersesInBook"/>).
    /// </summary>
    private static int ExpectedVersesInChapter(ScrVers versification, int bookNum, int chapterNumber) =>
        Canon.IsCanonical(bookNum) && chapterNumber >= 1 && chapterNumber <= versification.GetLastChapter(bookNum)
            ? versification.GetLastVerse(bookNum, chapterNumber)
            : 0;

    /// <summary>
    /// The number of verses the versification has in a book, or null for a book it does not describe. A versification
    /// only covers canonical books. For extra material such as front matter or a glossary it reports 998 chapters,
    /// which would count as hundreds of thousands of untranslated verses. (bookNum is zero for an unrecognised book id,
    /// which is not canonical either.)
    /// </summary>
    private static int? ExpectedVersesInBook(ScrVers versification, int bookNum) =>
        Canon.IsCanonical(bookNum)
            ? Enumerable
                .Range(1, versification.GetLastChapter(bookNum))
                .Sum(chapterNumber => versification.GetLastVerse(bookNum, chapterNumber))
            : null;
}
