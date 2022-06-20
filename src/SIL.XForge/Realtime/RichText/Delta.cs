using AbrarJahin.DiffMatchPatch;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace SIL.XForge.Realtime.RichText
{
    /// <summary>
    /// Represents the current state of rich text data, or represents changes to be applied to rich text data.
    /// Rich text data includes the plain text and associated formatting.
    /// </summary>
    public class Delta
    {
        private static readonly Lazy<DeltaEqualityComparer> _equalityComparer = new Lazy<DeltaEqualityComparer>();
        public static DeltaEqualityComparer EqualityComparer => _equalityComparer.Value;
        private static readonly diff_match_patch Differ = new diff_match_patch();

        public const string InsertType = "insert";
        public const string DeleteType = "delete";
        public const string RetainType = "retain";
        public const string Attributes = "attributes";

        public static Delta New()
        {
            return new Delta();
        }

        public Delta()
        {
            Ops = new List<JToken>();
        }

        public Delta(IEnumerable<JToken> ops)
        {
            Ops = ops.ToList();
        }

        public Delta(Delta delta)
        {
            Ops = delta.Ops.Select(op => op.DeepClone()).ToList();
        }

        public List<JToken> Ops { get; set; }

        public Delta Insert(object text, object attributes = null)
        {
            var textToken = text as JToken;
            if (textToken == null)
                textToken = JToken.FromObject(text);
            JToken attrsToken = null;
            if (attributes != null)
            {
                attrsToken = attributes as JToken;
                if (attrsToken == null)
                    attrsToken = JToken.FromObject(attributes);
            }

            if (textToken.Type == JTokenType.String && ((string)textToken).Length == 0)
                return this;

            var newOp = new JObject(new JProperty(InsertType, textToken));
            if (attrsToken != null && attrsToken.HasValues)
                newOp[Attributes] = attrsToken;

            return Add(newOp);
        }

        public Delta Delete(int length)
        {
            if (length <= 0)
                return this;

            return Add(new JObject(new JProperty(DeleteType, length)));
        }

        public Delta Retain(int length, object attributes = null)
        {
            if (length <= 0)
                return this;

            JToken attrsToken = null;
            if (attributes != null)
            {
                attrsToken = attributes as JToken;
                if (attrsToken == null)
                    attrsToken = JToken.FromObject(attributes);
            }

            var newOp = new JObject(new JProperty(RetainType, length));
            if (attrsToken != null && attrsToken.HasValues)
                newOp[Attributes] = attrsToken;

            return Add(newOp);
        }

        public Delta Chop()
        {
            JToken lastOp = Ops.Count == 0 ? null : Ops[Ops.Count - 1];
            if (lastOp != null && lastOp[RetainType] != null && lastOp[Attributes] == null)
                Ops.RemoveAt(Ops.Count - 1);
            return this;
        }

        public Delta Compose(Delta other)
        {
            var thisIter = new OpIterator(Ops);
            var otherIter = new OpIterator(other.Ops);
            var delta = new Delta();
            while (thisIter.HasNext() || otherIter.HasNext())
            {
                if (otherIter.PeekType() == InsertType)
                {
                    delta.Add(otherIter.Next());
                }
                else if (thisIter.PeekType() == DeleteType)
                {
                    delta.Add(thisIter.Next());
                }
                else
                {
                    int length = Math.Min(thisIter.PeekLength(), otherIter.PeekLength());
                    JToken thisOp = thisIter.Next(length);
                    JToken otherOp = otherIter.Next(length);
                    if (otherOp.OpType() == RetainType)
                    {
                        var newOp = new JObject();
                        if (thisOp.OpType() == RetainType)
                            newOp[RetainType] = length;
                        else
                            newOp[InsertType] = thisOp[InsertType];

                        JToken attributes = ComposeAttributes(
                            thisOp[Attributes],
                            otherOp[Attributes],
                            thisOp.OpType() == RetainType
                        );
                        if (attributes != null)
                            newOp[Attributes] = attributes;
                        delta.Add(newOp);
                    }
                    else if (otherOp.OpType() == DeleteType && thisOp.OpType() == RetainType)
                    {
                        delta.Add(otherOp);
                    }
                }
            }
            return delta.Chop();
        }

        public Delta Diff(Delta other)
        {
            if (this == other)
                return new Delta();

            if (other == null)
            {
                throw new ArgumentNullException(nameof(other));
            }

            if (!TryConcatInserts(this, out string thisStr) || !TryConcatInserts(other, out string otherStr))
                throw new InvalidOperationException("Both deltas must be documents.");

            var delta = new Delta();

            List<Diff> diffResult = Differ.diff_main(thisStr, otherStr);
            var thisIter = new OpIterator(this.Ops);
            var otherIter = new OpIterator(other.Ops);

            // If the two deltas have differences in text content, include character IDs in the diff output (thus causing all cids to be changed when applying the diff later).
            // If the two deltas have identical text content, don't produce a diff of character IDs, except on ops with formatting changes where we will report cid differences.
            bool retainCharIds = thisStr == otherStr;

            // Note that when the text content is identical, the list of Diff results to process here will contain just one item.
            foreach (Diff component in diffResult)
            {
                int length = component.text.Length;
                DeltaOpsAttributeHelper deltaOpsHelper =
                    component.operation == Operation.EQUAL ? new DeltaOpsAttributeHelper(retainCharIds) : null;
                while (length > 0)
                {
                    int opLength = 0;
                    switch (component.operation)
                    {
                        case Operation.INSERT:
                            opLength = Math.Min(otherIter.PeekLength(), length);
                            delta.Add(otherIter.Next(opLength));
                            break;

                        case Operation.DELETE:
                            opLength = Math.Min(length, thisIter.PeekLength());
                            thisIter.Next(opLength);
                            delta.Delete(opLength);
                            break;

                        case Operation.EQUAL:
                            opLength = Math.Min(Math.Min(thisIter.PeekLength(), otherIter.PeekLength()), length);
                            JToken thisOp = thisIter.Next(opLength);
                            JToken otherOp = otherIter.Next(opLength);
                            deltaOpsHelper.Add(opLength, thisOp, otherOp);
                            break;
                    }
                    length -= opLength;
                }
                if (deltaOpsHelper != null)
                    deltaOpsHelper.AddOpsToDelta(delta);
            }
            return delta.Chop();
        }

        public int GetLength()
        {
            return Ops.Sum(op => op.OpLength());
        }

        public bool DeepEquals(Delta other)
        {
            if (Ops.Count != other.Ops.Count)
                return false;

            for (int i = 0; i < Ops.Count; i++)
            {
                if (!JToken.DeepEquals(Ops[i], other.Ops[i]))
                    return false;
            }
            return true;
        }

        public override string ToString()
        {
            var array = new JArray(Ops);
            return array.ToString();
        }

        /// <summary>
        /// Concatenate all the text belonging to a given verse, including section headings. If the verse string
        /// given is 0, this returns all the text previous to the first verse in the text.
        /// </summary>
        /// <param name="opStr">The string of text belonging to a verse.</param>
        /// <param name="verseRef">
        /// The reference to the verse. For example: "1". If the verses in the text data is combined, "1-2".
        /// </param>
        public bool TryConcatenateInserts(out string opStr, string verseRef)
        {
            List<JToken> verseOps = new List<JToken>();
            bool isTargetVerse = verseRef == "0";
            foreach (JToken op in this.Ops)
            {
                if (op[InsertType]?.Type == JTokenType.Object)
                {
                    if (((JObject)op[InsertType]).Property("verse")?.Value.Type == JTokenType.Object)
                    {
                        JProperty numberToken = ((JObject)((JObject)op[InsertType]).Property("verse").Value).Property(
                            "number"
                        );
                        // update target verse so we know what verse we are in
                        isTargetVerse =
                            numberToken.Value.Type == JTokenType.String && (string)numberToken.Value == verseRef;
                        continue;
                    }
                    else if (((JObject)op[InsertType]).Property("chapter")?.Value.Type == JTokenType.Object)
                        continue;
                }
                if (isTargetVerse)
                    verseOps.Add(op);
            }
            Delta verseDeltaOps = new Delta(verseOps);
            return TryConcatInserts(verseDeltaOps, out opStr);
        }

        private Delta Add(JToken newOp)
        {
            int index = Ops.Count;
            JToken lastOp = Ops.Count == 0 ? null : Ops[Ops.Count - 1];
            newOp = (JObject)newOp.DeepClone();
            if (lastOp != null && lastOp.Type == JTokenType.Object)
            {
                if (newOp.OpType() == DeleteType && lastOp.OpType() == DeleteType)
                {
                    int delete = (int)lastOp[DeleteType] + (int)newOp[DeleteType];
                    Ops[index - 1] = new JObject(new JProperty(DeleteType, delete));
                    return this;
                }

                if (lastOp.OpType() == DeleteType && newOp.OpType() == InsertType)
                {
                    index -= 1;
                    lastOp = index == 0 ? null : Ops[index - 1];
                    if (lastOp?.Type != JTokenType.Object)
                    {
                        Ops.Insert(0, newOp);
                        return this;
                    }
                }

                if (JToken.DeepEquals(newOp[Attributes], lastOp[Attributes]))
                {
                    if (newOp[InsertType]?.Type == JTokenType.String && lastOp[InsertType]?.Type == JTokenType.String)
                    {
                        string insert = (string)lastOp[InsertType] + (string)newOp[InsertType];
                        var op = new JObject(new JProperty(InsertType, insert));
                        if (newOp[Attributes]?.Type == JTokenType.Object)
                            op[Attributes] = newOp[Attributes];
                        Ops[index - 1] = op;
                        return this;
                    }
                    else if (newOp.OpType() == RetainType && lastOp.OpType() == RetainType)
                    {
                        int retain = (int)lastOp[RetainType] + (int)newOp[RetainType];
                        var op = new JObject(new JProperty(RetainType, retain));
                        if (newOp[Attributes]?.Type == JTokenType.Object)
                            op[Attributes] = newOp[Attributes];
                        Ops[index - 1] = op;
                        return this;
                    }
                }
            }

            Ops.Insert(index, newOp);
            return this;
        }

        private static JToken ComposeAttributes(JToken a, JToken b, bool keepNull)
        {
            JObject aObj = a?.Type == JTokenType.Object ? (JObject)a : new JObject();
            JObject bObj = b?.Type == JTokenType.Object ? (JObject)b : new JObject();
            JObject attributes = (JObject)bObj.DeepClone();
            if (!keepNull)
                attributes = new JObject(attributes.Properties().Where(p => p.Value.Type != JTokenType.Null));

            foreach (JProperty prop in aObj.Properties())
            {
                if (aObj[prop.Name] != null && bObj[prop.Name] == null)
                    attributes.Add(prop);
            }

            return attributes.HasValues ? attributes : null;
        }

        private static bool TryConcatInserts(Delta delta, out string str)
        {
            var sb = new StringBuilder();
            foreach (JToken op in delta.Ops)
            {
                if (op[InsertType] != null)
                {
                    sb.Append(op[InsertType]?.Type == JTokenType.String ? (string)op[InsertType] : "\0");
                }
                else
                {
                    str = null;
                    return false;
                }
            }
            str = sb.ToString();
            return true;
        }

        /// <summary>
        /// Test for value equality of two JTokens while ignoring the cid object property in char nodes.
        /// </summary>
        static bool JTokenDeepEqualsIgnoreCharId(JToken a, JToken b)
        {
            if (b == null)
                return false;
            // If the token is not an object, it will not have a char property
            if (a?.Type != JTokenType.Object || b.Type != JTokenType.Object)
                return JToken.DeepEquals(a, b);
            JObject aClone = (JObject)a.DeepClone();
            JObject bClone = (JObject)b.DeepClone();
            StripCharId(aClone);
            StripCharId(bClone);
            return JToken.DeepEquals(aClone, bClone);
        }

        static JToken DiffAttributes(JToken a, JToken b, bool ignoreCharIdDifferences)
        {
            JObject aObj = a?.Type == JTokenType.Object ? (JObject)a : new JObject();
            JObject bObj = b?.Type == JTokenType.Object ? (JObject)b : new JObject();
            // Clone the objects so that if there is a real difference in the attributes we can update the cid
            // to be the cid for the new object
            JObject aClone = (JObject)aObj.DeepClone();
            JObject bClone = (JObject)bObj.DeepClone();
            if (ignoreCharIdDifferences)
            {
                StripCharId(aClone);
                StripCharId(bClone);
            }
            // Make a list of all attributes and their values in b, that are changed, new, or removed in b.
            JObject attributes = aClone
                .Properties()
                .Select(p => p.Name)
                .Concat(bClone.Properties().Select(p => p.Name))
                .Aggregate(
                    new JObject(),
                    (attrs, key) =>
                    {
                        if (!JToken.DeepEquals(aClone[key], bClone[key]))
                            attrs[key] = bObj[key] == null ? JValue.CreateNull() : bObj[key];
                        return attrs;
                    }
                );
            return attributes.HasValues ? attributes : null;
        }

        /// <summary> Does a deep search and strips the cid object property from all char nodes. </summary>
        static void StripCharId(JObject obj)
        {
            if (obj.ContainsKey("char"))
            {
                switch (obj["char"].Type)
                {
                    case JTokenType.Object:
                        ((JObject)obj["char"]).Property("cid")?.Remove();
                        break;
                    case JTokenType.Array:
                        foreach (JToken token in (JArray)obj["char"])
                            if (token.Type == JTokenType.Object)
                                ((JObject)token).Property("cid")?.Remove();
                        break;
                    default:
                        break;
                }
            }
            IEnumerable<string> properties = obj.Properties().Select(p => p.Name);
            foreach (string prop in properties)
            {
                JToken token = obj[prop];
                if (token.Type == JTokenType.Object)
                {
                    // Strip the cid property off descendant nodes
                    StripCharId((JObject)token);
                }
                else if (token.Type == JTokenType.Array)
                {
                    // This JArray represents something similar to insert.note.contents.ops[]
                    for (int i = 0; i < token.Count(); i++)
                    {
                        if (token[i].Type == JTokenType.Object)
                        {
                            // Strip the cid property off descendant nodes
                            StripCharId((JObject)token[i]);
                        }
                    }
                }
            }
        }

        private class OpIterator
        {
            private readonly IReadOnlyList<JToken> _ops;
            private int _index;
            private int _offset;

            public OpIterator(IReadOnlyList<JToken> ops)
            {
                _ops = ops;
            }

            public bool HasNext()
            {
                return PeekLength() < int.MaxValue;
            }

            public JToken Next(int length = int.MaxValue)
            {
                if (_index >= _ops.Count)
                    return new JObject(new JProperty(RetainType, int.MaxValue));

                JToken nextOp = _ops[_index];
                int offset = _offset;
                int opLength = nextOp.OpLength();
                if (length >= opLength - offset)
                {
                    length = opLength - offset;
                    _index++;
                    _offset = 0;
                }
                else
                {
                    _offset += length;
                }

                if (nextOp.OpType() == DeleteType)
                    return new JObject(new JProperty(DeleteType, length));

                var retOp = new JObject();
                if (nextOp[Attributes] != null)
                    retOp[Attributes] = nextOp[Attributes];
                if (nextOp.OpType() == RetainType)
                    retOp[RetainType] = length;
                else if (nextOp[InsertType]?.Type == JTokenType.String)
                    retOp[InsertType] = ((string)nextOp[InsertType]).Substring(offset, length);
                else
                    retOp[InsertType] = nextOp[InsertType];
                return retOp;
            }

            public JToken Peek()
            {
                return _index >= _ops.Count ? null : _ops[_index];
            }

            public int PeekLength()
            {
                if (_index >= _ops.Count)
                    return int.MaxValue;
                return _ops[_index].OpLength() - _offset;
            }

            public string PeekType()
            {
                if (_index >= _ops.Count)
                    return RetainType;

                JToken nextOp = _ops[_index];
                return nextOp.OpType();
            }
        }

        /// <summary>Provides methods to process ops for text that may have attribute changes</summary>
        private class DeltaOpsAttributeHelper
        {
            private List<int> opLengths = new List<int>();
            private List<JObject> originalDeltaOps = new List<JObject>();
            private List<JObject> newDeltaOps = new List<JObject>();
            private bool retainCharIdsOnAttributes;

            public DeltaOpsAttributeHelper(bool retainCharIds)
            {
                retainCharIdsOnAttributes = retainCharIds;
            }

            public void Add(int length, JToken originalOp, JToken newOp)
            {
                opLengths.Add(length);
                JObject originalOpObject = originalOp?.Type == JTokenType.Object ? (JObject)originalOp : new JObject();
                JObject newOpObject = newOp?.Type == JTokenType.Object ? (JObject)newOp : new JObject();
                originalDeltaOps.Add(originalOpObject);
                newDeltaOps.Add(newOpObject);
            }

            /// <summary>Adds the ops to the given delta based on the ops added to the instance of this class</summary>
            public void AddOpsToDelta(Delta delta)
            {
                // To retain cid properties in this diff, we check whether there is a change in
                // the ops for all the ops in this diff. If the ops differ for any op
                // in this diff, we update all of the cid properties that have been regenerated. Otherwise,
                // we use the old cid properties instead of the regenerated ones.
                bool retainCharIds = retainCharIdsOnAttributes && !HaveOpsChanged();
                for (int i = 0; i < originalDeltaOps.Count; i++)
                {
                    JObject originalOp = originalDeltaOps[i];
                    JObject newOp = newDeltaOps[i];
                    if (JTokenDeepEqualsIgnoreCharId(originalOp[InsertType], newOp[InsertType]))
                    {
                        delta.Retain(
                            opLengths[i],
                            DiffAttributes(originalOp[Attributes], newOp[Attributes], retainCharIds)
                        );
                    }
                    else
                    {
                        delta.Add(newOp);
                        delta.Delete(opLengths[i]);
                    }
                }
            }

            private bool HaveOpsChanged()
            {
                JObject[] originalOpsArray = originalDeltaOps.ToArray();
                JObject[] newOpsArray = newDeltaOps.ToArray();
                for (int i = 0; i < originalOpsArray.Length; i++)
                {
                    JObject originalOp = originalOpsArray[i];
                    JObject newOp = newOpsArray[i];
                    if (!JTokenDeepEqualsIgnoreCharId(originalOp[InsertType], newOp[InsertType]))
                        return true;
                    if (!JTokenDeepEqualsIgnoreCharId(originalOp[Attributes], newOp[Attributes]))
                        return true;
                }
                return false;
            }
        }
    }
}
