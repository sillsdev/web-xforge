using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using MongoDB.Bson;
using SIL.Machine.Corpora;
using SIL.Machine.Tokenization;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>Set of Scripture text segments.</summary>
    public class SFScriptureText : IText
    {
        /// <remarks>Builds segments from texts and references. Will use ops in doc that have an insert and a segment attribute providing reference information.
        /// For example,
        /// { "insert": "In the beginning ...",
        ///   "attributes": { "segment": "verse_1_1" } }
        /// </remarks>
        public SFScriptureText(ITokenizer<string, int> wordTokenizer, string projectId, int book, int chapter,
            BsonDocument doc)
        {
            if (doc == null)
            {
                throw new ArgumentNullException(nameof(doc));
            }
            Id = $"{projectId}_{book}_{chapter}";
            Segments = GetSegments(wordTokenizer, doc).OrderBy(s => s.SegmentRef).ToArray();
        }

        public string Id { get; }

        public IEnumerable<TextSegment> Segments { get; }

        private static IEnumerable<TextSegment> GetSegments(ITokenizer<string, int> wordTokenizer, BsonDocument doc)
        {
            string prevRef = null;
            var sb = new StringBuilder();
            doc.TryGetValue("ops", out BsonValue ops);
            if (ops as BsonArray == null)
            {
                yield break;
            }
            foreach (BsonDocument op in ((BsonArray)ops).Cast<BsonDocument>())
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
                    yield return CreateSegment(wordTokenizer, prevRef, sb.ToString());
                    sb.Clear();
                }

                string text = value.AsString;
                sb.Append(text);
                prevRef = curRef;
            }

            if (prevRef != null)
                yield return CreateSegment(wordTokenizer, prevRef, sb.ToString());
        }

        private static TextSegment CreateSegment(ITokenizer<string, int> wordTokenizer, string segRef,
            string segmentStr)
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
            string[] segment = wordTokenizer.TokenizeToStrings(segmentStr).ToArray();
            return new TextSegment(new TextSegmentRef(keys), segment);
        }
    }
}
