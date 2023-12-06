using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using MongoDB.Bson;
using SIL.Machine.Corpora;
using SIL.Machine.Tokenization;
using SIL.Machine.Utils;

namespace SIL.XForge.Scripture.Services;

/// <summary>Set of Scripture text segments.</summary>
public class SFScriptureText : IText
{
    private readonly IEnumerable<TextSegment> _segments;

    /// <summary>
    /// Initializes a new instance of the <see cref="SFScriptureText"/> class.
    /// </summary>
    /// <param name="wordTokenizer">The word tokenizer.</param>
    /// <param name="projectId">The SF project identifier.</param>
    /// <param name="book">The book number.</param>
    /// <param name="chapter">The chapter number.</param>
    /// <param name="includeBlankSegments">If <c>true</c>, include blank segments. Usually used for pre-translation.</param>
    /// <param name="doNotSendSegmentText">If <c>true</c>, send segments clear of all text.</param>
    /// <param name="doc">The doc to generate the text from</param>
    /// <remarks>Builds segments from texts and references.
    /// Will use ops in doc that have an insert and a segment attribute providing reference information.
    /// For example,
    /// { "insert": "In the beginning ...",
    ///   "attributes": { "segment": "verse_1_1" } }
    /// </remarks>
    /// <exception cref="ArgumentNullException">The doc is empty.</exception>
    /// <exception cref="ArgumentException">The doc has no ops.</exception>
    public SFScriptureText(
        ITokenizer<string, int, string> wordTokenizer,
        string projectId,
        int book,
        int chapter,
        bool includeBlankSegments,
        bool doNotSendSegmentText,
        BsonDocument doc
    )
    {
        if (doc == null)
            throw new ArgumentNullException(nameof(doc));
        doc.TryGetValue("ops", out BsonValue ops);
        if (ops as BsonArray == null)
            throw new ArgumentException(@"Doc is missing ops, perhaps the doc was deleted.", nameof(doc));

        Id = $"{projectId}_{book}_{chapter}";
        _segments = GetSegments(wordTokenizer, doc, includeBlankSegments, doNotSendSegmentText)
            .OrderBy(s => s.SegmentRef)
            .ToArray();
    }

    public string Id { get; }

    public string SortKey => Id;

    public IEnumerable<TextSegment> GetSegments(bool includeText = true, IText? basedOn = null) => _segments;

    private IEnumerable<TextSegment> GetSegments(
        ITokenizer<string, int, string> wordTokenizer,
        BsonDocument doc,
        bool includeBlankSegments,
        bool doNotSendSegmentText
    )
    {
        string prevRef = null;
        bool isSentenceStart = true;
        var sb = new StringBuilder();
        var ops = (BsonArray)doc["ops"];
        foreach (BsonDocument op in ops.Cast<BsonDocument>())
        {
            if (!op.TryGetValue("insert", out BsonValue value))
            {
                // Ensure there is an insert op
                continue;
            }
            else if (includeBlankSegments && value.BsonType != BsonType.String)
            {
                // If we are to include blank segments, ensure this one is blank
                BsonDocument insert = value.AsBsonDocument;
                if (
                    !insert.TryGetValue("blank", out BsonValue blankValue)
                    || !blankValue.IsBoolean
                    || !blankValue.AsBoolean
                )
                {
                    continue;
                }
            }
            else if (value.BsonType != BsonType.String)
            {
                // skip embeds
                continue;
            }

            if (!op.TryGetValue("attributes", out BsonValue attrsValue))
                continue;

            BsonDocument attrs = attrsValue.AsBsonDocument;
            if (!attrs.TryGetValue("segment", out BsonValue segmentValue))
                continue;

            string curRef = segmentValue.AsString;
            if (prevRef != null && prevRef != curRef)
            {
                // Return the previous segment, using the current segment to calculate ss,ir,rs values
                yield return CreateSegment(
                    wordTokenizer,
                    prevRef,
                    sb.ToString(),
                    isSentenceStart,
                    doNotSendSegmentText
                );
                isSentenceStart = sb.ToString().HasSentenceEnding();
                sb.Clear();
            }

            string text = value.IsString ? value.AsString : string.Empty;
            sb.Append(text);
            prevRef = curRef;
        }

        if (prevRef != null)
        {
            yield return CreateSegment(wordTokenizer, prevRef, sb.ToString(), isSentenceStart, doNotSendSegmentText);
        }
    }

    private TextSegment CreateSegment(
        ITokenizer<string, int, string> wordTokenizer,
        string segRef,
        string segmentStr,
        bool isSentenceStart,
        bool doNotSendSegmentText
    )
    {
        var keys = new List<string>();
        foreach (string refPart in segRef.Split('/'))
        {
            string[] partKeys = refPart.Split('_');
            // do not include the paragraph style for sub-segments, so that the segments sort correctly
            keys.AddRange(keys.Count > 0 ? partKeys.Skip(1) : partKeys);
        }
        string[] segment = doNotSendSegmentText ? Array.Empty<string>() : wordTokenizer.Tokenize(segmentStr).ToArray();
        return new TextSegment(Id, new TextSegmentRef(keys), segment, isSentenceStart, false, false, !segment.Any());
    }
}
