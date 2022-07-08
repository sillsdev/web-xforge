using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using MongoDB.Bson;
using SIL.Machine.Corpora;
using SIL.Machine.Tokenization;
using SIL.Machine.Utils;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>Set of Scripture text segments.</summary>
    public class SFScriptureText : IText
    {
        private IEnumerable<TextSegment> _segments;

        /// <remarks>Builds segments from texts and references.
        /// Will use ops in doc that have an insert and a segment attribute providing reference information.
        /// For example,
        /// { "insert": "In the beginning ...",
        ///   "attributes": { "segment": "verse_1_1" } }
        /// </remarks>
        public SFScriptureText(ITokenizer<string, int, string> wordTokenizer, string projectId, int book, int chapter,
            BsonDocument doc)
        {
            if (doc == null)
                throw new ArgumentNullException(nameof(doc));
            doc.TryGetValue("ops", out BsonValue ops);
            if (ops as BsonArray == null)
                throw new ArgumentException("Doc is missing ops, perhaps the doc was deleted.", nameof(doc));

            Id = $"{projectId}_{book}_{chapter}";
            _segments = GetSegments(wordTokenizer, doc).OrderBy(s => s.SegmentRef).ToArray();
        }

        public string Id { get; }


        public string SortKey => Id;

        public IEnumerable<TextSegment> GetSegments(bool includeText = true, IText basedOn = null)
        {
            return _segments;
        }

        private IEnumerable<TextSegment> GetSegments(ITokenizer<string, int, string> wordTokenizer,
            BsonDocument doc)
        {
            string prevRef = null;
            bool isSentenceStart = true;
            bool isInRange = false;
            bool isRangeStart = false;
            var sb = new StringBuilder();
            var ops = (BsonArray)doc["ops"];
            foreach (BsonDocument op in ops.Cast<BsonDocument>())
            {
                // skip embeds
                if (!op.TryGetValue("insert", out BsonValue value) || value.BsonType != BsonType.String)
                    continue;

                if (!op.TryGetValue("attributes", out BsonValue attrsValue))
                    continue;

                BsonDocument attrs = attrsValue.AsBsonDocument;
                if (!attrs.TryGetValue("segment", out BsonValue segmentValue))
                    continue;

                string curRef = segmentValue.AsString;
                if (prevRef != null && prevRef != curRef)
                {
                    bool inRange = curRef.IndexOf("/") != -1;
                    isRangeStart = curRef.StartsWith(prevRef) && inRange;
                    isInRange = isRangeStart || inRange;
                    yield return CreateSegment(wordTokenizer, prevRef, sb.ToString(), isSentenceStart, isInRange,
                        isRangeStart);
                    isSentenceStart = sb.ToString().HasSentenceEnding();
                    sb.Clear();
                }

                string text = value.AsString;
                sb.Append(text);
                prevRef = curRef;
            }

            if (prevRef != null)
            {
                yield return CreateSegment(wordTokenizer, prevRef, sb.ToString(), isSentenceStart, isInRange, false);
            }
        }

        private TextSegment CreateSegment(ITokenizer<string, int, string> wordTokenizer, string segRef,
            string segmentStr, bool isSentenceStart, bool isInRange, bool isRangeStart)
        {
            var keys = new List<string>();
            foreach (string refPart in segRef.Split('/'))
            {
                string[] partKeys = refPart.Split('_');
                // do not include the paragraph style for sub-segments, so that the segments sort correctly
                if (keys.Count > 0)
                    keys.AddRange(partKeys.Skip(1));
                else
                    keys.AddRange(partKeys);
            }
            string[] segment = wordTokenizer.Tokenize(segmentStr).ToArray();
            return new TextSegment(Id, new TextSegmentRef(keys), segment, isSentenceStart, isInRange, isRangeStart,
                segment.Count() == 0);
        }
    }
}
