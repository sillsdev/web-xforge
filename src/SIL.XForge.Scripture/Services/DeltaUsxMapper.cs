using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Xml.Linq;
using System.Xml.Schema;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;
using SIL.XForge.Realtime.RichText;

namespace SIL.XForge.Scripture.Services
{
    public class DeltaUsxMapper : IDeltaUsxMapper
    {
        private static readonly XmlSchemaSet Schemas = CreateSchemaSet();

        private static XmlSchemaSet CreateSchemaSet()
        {
            var schemas = new XmlSchemaSet();
            schemas.Add("", "usx-sf.xsd");
            schemas.Compile();
            return schemas;
        }

        private static readonly HashSet<string> ParagraphPoetryListStyles = new HashSet<string>
        {
            // Paragraphs
            "p", "m", "po", "pr", "cls", "pmo", "pm", "pmc", "pmr", "pi", "mi", "pc", "ph", "lit",
            // Poetry
            "q", "qr", "qc", "qa", "qm", "qd",
            // Lists
            "lh", "li", "lf", "lim",
        };

        private IGuidService GuidService;
        private ILogger<DeltaUsxMapper> Logger;
        private readonly IExceptionHandler ExceptionHandler;

        private class ParseState
        {
            public string CurRef { get; set; }
            public string CurChapter { get; set; }
            public bool CurChapterIsValid { get; set; } = true;
            public int TableIndex { get; set; }
            public bool ImpliedParagraph { get; set; }
            public int LastVerse { get; set; }
            public string LastVerseStr
            {
                set
                {
                    if (value != null)
                    {
                        int lastVerse = LastVerse;
                        int dashIndex = value.IndexOf('-');
                        if (dashIndex != -1)
                            value = value.Substring(dashIndex + 1);
                        if (int.TryParse(value, System.Globalization.NumberStyles.Integer, CultureInfo.InvariantCulture,
                                out int _lastVerse))
                            lastVerse = _lastVerse;
                        LastVerse = lastVerse;
                    }
                }
            }
        }

        public DeltaUsxMapper(IGuidService guidService, ILogger<DeltaUsxMapper> logger,
            IExceptionHandler exceptionHandler)
        {
            GuidService = guidService;
            Logger = logger;
            ExceptionHandler = exceptionHandler;
        }

        /// <summary>
        /// Create list of ChapterDelta objects from USX.
        ///
        /// PT Data Access gives USX with chapters for each chapter that is
        /// present in its project content. It will skip over chapters that are
        /// not present in its project content. If there are no chapters present
        /// in the project content, PT Data Access will return USX with no explicit
        /// chapters.
        ///
        /// ToChapterDeltas will return a ChapterDelta for each chapter in
        /// USX. If there are no explicit chapters in USX, return a single
        /// ChapterDelta with a non-null Delta with an empty Ops list. This
        /// is because every book has at least one chapter. The book
        /// introduction is part of an implicit first chapter, even if there
        /// are no explicit chapters.
        /// </summary>
        public IEnumerable<ChapterDelta> ToChapterDeltas(XDocument usxDoc)
        {
            var invalidNodes = new HashSet<XNode>();
            usxDoc.Validate(Schemas, (o, e) =>
                {
                    XNode node;
                    var attr = o as XAttribute;
                    if (attr != null)
                        node = attr.Parent;
                    else
                        node = (XNode)o;
                    invalidNodes.Add(node);
                }, true);
            var chapterDeltas = new List<ChapterDelta>();
            var chapterDelta = new Delta();
            var nextIds = new Dictionary<string, int>();
            var state = new ParseState();
            foreach (XNode node in usxDoc.Element("usx").Nodes())
            {
                switch (node)
                {
                    case XElement elem:
                        switch (elem.Name.LocalName)
                        {
                            case "book":
                                break;

                            case "para":
                                if (state.ImpliedParagraph)
                                {
                                    chapterDelta.Insert('\n');
                                    state.ImpliedParagraph = false;
                                }
                                var style = (string)elem.Attribute("style");
                                bool canContainVerseText = CanParaContainVerseText(style);
                                if (canContainVerseText)
                                {
                                    if (state.CurRef != null)
                                    {
                                        int slashIndex = state.CurRef.IndexOf("/", StringComparison.Ordinal);
                                        if (slashIndex != -1)
                                            state.CurRef = state.CurRef.Substring(0, slashIndex);
                                        state.CurRef = GetParagraphRef(nextIds, state.CurRef, state.CurRef + "/" + style);
                                    }
                                    else
                                    {
                                        state.CurRef = GetParagraphRef(nextIds, style, style);
                                    }
                                }
                                else if (style == "b")
                                {
                                    // insert the line break and continue processing with the current verse ref
                                    InsertPara(invalidNodes, chapterDelta, elem, state);
                                    continue;
                                }
                                else
                                {
                                    state.CurRef = GetParagraphRef(nextIds, style, style);
                                }
                                ProcessChildNodes(invalidNodes, chapterDelta, elem, state);
                                SegmentEnded(chapterDelta, state.CurRef);
                                if (!canContainVerseText)
                                    state.CurRef = null;
                                InsertPara(invalidNodes, chapterDelta, elem, state);
                                break;

                            case "chapter":
                                if (state.CurChapter != null)
                                {
                                    ChapterEnded(chapterDeltas, chapterDelta, state);
                                    nextIds.Clear();
                                    chapterDelta = new Delta();
                                    state.CurChapterIsValid = true;
                                }
                                state.CurRef = null;
                                state.LastVerse = 0;
                                state.CurChapter = (string)elem.Attribute("number");
                                chapterDelta.InsertEmbed("chapter", GetAttributes(elem),
                                    attributes: AddInvalidBlockAttribute(invalidNodes, elem));
                                break;

                            // according to the USX schema, a verse can only occur within a paragraph, but Paratext 8.0
                            // can still generate USX with verses at the top-level
                            case "verse":
                                ProcessChildNode(invalidNodes, chapterDelta, elem, state);
                                state.ImpliedParagraph = true;
                                break;

                            default:
                                ProcessChildNode(invalidNodes, chapterDelta, elem, state);
                                break;
                        }
                        if (elem.GetSchemaInfo().Validity != XmlSchemaValidity.Valid)
                            state.CurChapterIsValid = false;
                        break;

                    case XText text:
                        chapterDelta.InsertText(text.Value, state.CurRef,
                            AddInvalidInlineAttribute(invalidNodes, text));
                        state.ImpliedParagraph = true;
                        break;
                }
            }
            if (state.CurChapter == null)
                state.CurChapter = "1";
            ChapterEnded(chapterDeltas, chapterDelta, state);
            return chapterDeltas;
        }

        private void ProcessChildNodes(HashSet<XNode> invalidNodes, Delta newDelta, XElement parentElem)
        {
            ProcessChildNodes(invalidNodes, newDelta, parentElem, new ParseState());
        }

        private void ProcessChildNodes(HashSet<XNode> invalidNodes, Delta newDelta, XElement parentElem,
            ParseState state, JObject attributes = null)
        {
            foreach (XNode node in parentElem.Nodes())
                ProcessChildNode(invalidNodes, newDelta, node, state, attributes);
        }

        private void ProcessChildNode(HashSet<XNode> invalidNodes, Delta newDelta, XNode node, ParseState state,
            JObject attributes = null)
        {
            switch (node)
            {
                case XElement elem:
                    switch (elem.Name.LocalName)
                    {
                        case "para":
                            ProcessChildNodes(invalidNodes, newDelta, elem);
                            InsertPara(invalidNodes, newDelta, elem, state);
                            break;

                        case "verse":
                            state.LastVerseStr = (string)elem.Attribute("number");
                            InsertVerse(invalidNodes, newDelta, elem, state);
                            break;

                        case "ref":
                            var newRefAttributes = (JObject)attributes?.DeepClone() ?? new JObject();
                            newRefAttributes.Add(new JProperty(elem.Name.LocalName, GetAttributes(elem)));
                            newRefAttributes = AddInvalidInlineAttribute(invalidNodes, elem, newRefAttributes);
                            newDelta.InsertText(elem.Value, state.CurRef, newRefAttributes);
                            break;

                        case "char":
                            var newChildAttributes = (JObject)attributes?.DeepClone() ?? new JObject();
                            JToken existingCharAttrs = newChildAttributes["char"];
                            JObject newCharAttrs = GetAttributes(elem);
                            if (!newCharAttrs.ContainsKey("cid"))
                                newCharAttrs.Add("cid", GuidService.Generate());

                            if (existingCharAttrs == null)
                                newChildAttributes.Add(new JProperty(elem.Name.LocalName, newCharAttrs));
                            else
                            {
                                switch (existingCharAttrs)
                                {
                                    case JArray array:
                                        array.Add(newCharAttrs);
                                        break;
                                    case JObject obj:
                                        newChildAttributes[elem.Name.LocalName] = new JArray(obj, newCharAttrs);
                                        break;
                                }
                            }
                            newChildAttributes = AddInvalidInlineAttribute(invalidNodes, elem, newChildAttributes);
                            if (!elem.Nodes().Any() && elem.Value == "")
                                newDelta.InsertEmpty(state.CurRef, newChildAttributes);
                            else
                                ProcessChildNodes(invalidNodes, newDelta, elem, state, newChildAttributes);
                            break;

                        case "table":
                            state.TableIndex++;
                            JObject tableAttributes = GetAttributes(elem);
                            tableAttributes.Add(new JProperty("id", $"table_{state.TableIndex}"));
                            int rowIndex = 1;
                            foreach (XElement row in elem.Elements("row"))
                            {
                                var rowAttributes = new JObject(
                                    new JProperty("id", $"row_{state.TableIndex}_{rowIndex}"));
                                int cellIndex = 1;
                                foreach (XElement cell in row.Elements())
                                {
                                    state.CurRef = $"cell_{state.TableIndex}_{rowIndex}_{cellIndex}";
                                    ProcessChildNode(invalidNodes, newDelta, cell, state);
                                    SegmentEnded(newDelta, state.CurRef);
                                    var attrs = new JObject(
                                        new JProperty("table", tableAttributes),
                                        new JProperty("row", rowAttributes));
                                    if (cell.Name.LocalName == "cell")
                                        attrs.Add(new JProperty("cell", GetAttributes(cell)));
                                    attrs = AddInvalidBlockAttribute(invalidNodes, elem, attrs);
                                    attrs = AddInvalidBlockAttribute(invalidNodes, row, attrs);
                                    attrs = AddInvalidBlockAttribute(invalidNodes, cell, attrs);
                                    newDelta.Insert("\n", attrs);
                                    cellIndex++;
                                }
                                rowIndex++;
                            }
                            state.CurRef = null;
                            break;

                        case "cell":
                            ProcessChildNodes(invalidNodes, newDelta, elem, state);
                            break;

                        default:
                            InsertEmbed(invalidNodes, newDelta, elem, state.CurRef, attributes);
                            break;
                    }
                    break;

                case XText text:
                    newDelta.InsertText(text.Value, state.CurRef,
                        AddInvalidInlineAttribute(invalidNodes, text, attributes));
                    break;
            }
        }

        private void ChapterEnded(List<ChapterDelta> chapterDeltas, Delta chapterDelta, ParseState state)
        {
            if (state.ImpliedParagraph)
            {
                SegmentEnded(chapterDelta, state.CurRef);
                chapterDelta.Insert('\n');
                state.ImpliedParagraph = false;
            }
            if (!int.TryParse(state.CurChapter, out int chapterNum))
                return;

            chapterDeltas.Add(new ChapterDelta(chapterNum, state.LastVerse, state.CurChapterIsValid, chapterDelta));
        }

        private static void InsertVerse(HashSet<XNode> invalidNodes, Delta newDelta, XElement elem, ParseState state)
        {
            var verse = (string)elem.Attribute("number");
            SegmentEnded(newDelta, state.CurRef);
            state.CurRef = $"verse_{state.CurChapter}_{verse}";
            newDelta.InsertEmbed("verse", GetAttributes(elem),
                attributes: AddInvalidInlineAttribute(invalidNodes, elem));
        }

        private void InsertEmbed(HashSet<XNode> invalidNodes, Delta newDelta, XElement elem, string curRef,
            JObject attributes)
        {
            JObject obj = GetAttributes(elem);
            var contents = new Delta();
            ProcessChildNodes(invalidNodes, contents, elem);
            if (contents.Ops.Count > 0)
            {
                obj.Add(new JProperty("contents",
                    new JObject(new JProperty("ops", new JArray(contents.Ops)))));
            }
            newDelta.InsertEmbed(elem.Name.LocalName, obj, curRef,
                AddInvalidInlineAttribute(invalidNodes, elem, attributes));
        }

        private static void InsertPara(HashSet<XNode> invalidNodes, Delta newDelta, XElement elem, ParseState state)
        {
            string style = elem.Attribute("style")?.Value;
            bool canContainVerseText = CanParaContainVerseText(style);
            if (!canContainVerseText && elem.Descendants("verse").Any())
            {
                invalidNodes.Add(elem);
                state.CurChapterIsValid = false;
            }
            newDelta.InsertPara(GetAttributes(elem), AddInvalidBlockAttribute(invalidNodes, elem));
        }

        private static void SegmentEnded(Delta newDelta, string segRef)
        {
            if (segRef == null)
                return;

            if (newDelta.Ops.Count == 0)
            {
                newDelta.InsertBlank(segRef);
            }
            else
            {
                JToken lastOp = newDelta.Ops[newDelta.Ops.Count - 1];
                string lastOpText = "";
                if (lastOp[Delta.InsertType].Type == JTokenType.String)
                    lastOpText = (string)lastOp[Delta.InsertType];
                var embed = lastOp[Delta.InsertType] as JObject;
                var attrs = (JObject)lastOp[Delta.Attributes];
                if ((embed != null && (embed["verse"] != null || embed["chapter"] != null))
                    || (attrs != null && (attrs["para"] != null || attrs["table"] != null))
                    || lastOpText.EndsWith('\n'))
                {
                    newDelta.InsertBlank(segRef);
                }
            }
        }

        private static bool CanParaContainVerseText(string style)
        {
            // an empty style indicates an improperly formatted paragraph which could contain verse text
            if (style == string.Empty)
                return true;
            if (char.IsDigit(style[style.Length - 1]))
                style = style.Substring(0, style.Length - 1);
            // paragraph, poetry, and list styles are the only types of valid paras that can contain verse text
            return ParagraphPoetryListStyles.Contains(style);
        }

        private static string GetParagraphRef(Dictionary<string, int> nextIds, string key, string prefix)
        {
            if (!nextIds.ContainsKey(key))
                nextIds[key] = 1;
            return prefix + "_" + nextIds[key]++;
        }

        private static JObject GetAttributes(XElement elem)
        {
            var obj = new JObject();
            foreach (XAttribute attribute in elem.Attributes())
                obj.Add(new JProperty(attribute.Name.LocalName, attribute.Value));
            return obj;
        }

        private static JObject AddInvalidInlineAttribute(HashSet<XNode> invalidNodes, XNode node,
            JObject attributes = null)
        {
            if (invalidNodes.Contains(node))
            {
                attributes = (JObject)attributes?.DeepClone() ?? new JObject();
                attributes.Add(new JProperty("invalid-inline", true));
            }
            return attributes;
        }

        private static JObject AddInvalidBlockAttribute(HashSet<XNode> invalidNodes, XNode node,
            JObject attributes = null)
        {
            if (invalidNodes.Contains(node))
            {
                attributes = (JObject)attributes?.DeepClone() ?? new JObject();
                attributes.Add(new JProperty("invalid-block", true));
            }
            return attributes;
        }

        /// <summary>
        /// It may be that this method is taking USX, leaving alone all chapters not specified and valid in
        /// chapterDeltas, and then replacing all chapters in the USX, that are in chapterDeltas and valid, with
        /// the data from the chapterDeltas.
        /// </summary>
        public XDocument ToUsx(XDocument oldUsxDoc, IEnumerable<ChapterDelta> chapterDeltas)
        {
            var newUsxDoc = new XDocument(oldUsxDoc);
            int curChapter = 1;
            bool isFirstChapterFound = false;
            ChapterDelta[] chapterDeltaArray = chapterDeltas.ToArray();
            int i = 0;
            try
            {
                if (chapterDeltaArray.Length == 1 && chapterDeltaArray[0]?.Delta.Ops.Count == 0)
                {
                    int usxChapterCount = oldUsxDoc.Root.Nodes().Count((XNode node) => IsElement(node, "chapter"));
                    // The chapterDeltas indicate this may be a book in the SF DB with no chapters, but the USX
                    // indicates that we should have known there were chapters and previously recorded them in
                    // the SF DB.
                    if (usxChapterCount > 0)
                    {
                        string errorExplanation = "ToUsx() received a chapterDeltas with no real chapters "
                            + $"(just one 'chapter' with a Delta.Ops.Count of 0), and USX with {usxChapterCount} "
                            + "chapters. This may indicate corrupt data in the SF DB. Handling by ignoring "
                            + "chapterDeltas and returning the input USX.";
                        Logger.LogWarning(errorExplanation);
                        // Report to bugsnag, but don't throw.
                        var report = new ArgumentException(errorExplanation);
                        ExceptionHandler.ReportException(report);
                    }
                    return oldUsxDoc;
                }
                foreach (XNode curNode in newUsxDoc.Root.Nodes().ToArray())
                {
                    if (IsElement(curNode, "chapter"))
                    {
                        if (isFirstChapterFound)
                        {
                            ChapterDelta chapterDelta = chapterDeltaArray[i];
                            if (chapterDelta.Number == curChapter)
                            {
                                if (chapterDelta.IsValid)
                                    curNode.AddBeforeSelf(ProcessDelta(chapterDelta.Delta));
                                i++;
                            }
                            var numberStr = (string)((XElement)curNode).Attribute("number");
                            if (int.TryParse(numberStr, out int number))
                                curChapter = number;
                        }
                        else
                        {
                            isFirstChapterFound = true;
                        }
                    }

                    if (chapterDeltaArray[i].Number == curChapter && chapterDeltaArray[i].IsValid
                        && !IsElement(curNode, "book"))
                    {
                        curNode.Remove();
                    }
                }

                if (chapterDeltaArray[i].Number == curChapter && chapterDeltaArray[i].IsValid)
                    newUsxDoc.Root.Add(ProcessDelta(chapterDeltaArray[i].Delta));
                return newUsxDoc;
            }
            catch (Exception e)
            {
                int usxChapterCount = oldUsxDoc.Root.Nodes().Count((XNode node) => IsElement(node, "chapter"));
                string errorExplanation = $"ToUsx() had a problem ({e.Message}). SF DB corruption can cause "
                    + "IndexOutOfRangeException to be thrown here. Rethrowing. Diagnostic info: "
                    + $"chapterDeltas length is {chapterDeltaArray.Length}, "
                    + $"The first chapterDeltas Delta.Ops.Count is "
                    + $"{chapterDeltaArray.ElementAtOrDefault(0)?.Delta.Ops.Count}, "
                    + $"The input oldUsxDoc has this many chapter elements: {usxChapterCount}, "
                    + $"i is {i}, isFirstChapterFound is {isFirstChapterFound}.";
                throw new Exception(errorExplanation, e);
            }
        }

        private IEnumerable<XNode> ProcessDelta(Delta delta)
        {
            var content = new List<XNode>();
            var curCharAttrs = new List<JObject>();
            var childNodes = new Stack<List<XNode>>();
            childNodes.Push(new List<XNode>());
            JObject curTableAttrs = null;
            JObject curRowAttrs = null;
            foreach (JToken op in delta.Ops)
            {
                if (op.OpType() != Delta.InsertType)
                    throw new ArgumentException("The delta is not a document.", nameof(delta));

                var attrs = (JObject)op[Delta.Attributes];
                if (curCharAttrs.Count > 0 && (attrs == null || attrs["char"] == null))
                {
                    while (curCharAttrs.Count > 0)
                        CharEnded(childNodes, curCharAttrs);
                }
                else if (attrs != null && attrs["char"] != null)
                {
                    List<JObject> charAttrs = GetCharAttributes(attrs["char"]);
                    while (curCharAttrs.Count > 0 && !CharAttributesMatch(curCharAttrs, charAttrs))
                        CharEnded(childNodes, curCharAttrs);
                    curCharAttrs = charAttrs;
                    while (childNodes.Count < curCharAttrs.Count + 1)
                        childNodes.Push(new List<XNode>());
                }

                if (op[Delta.InsertType].Type == JTokenType.String)
                {
                    var text = (string)op[Delta.InsertType];
                    if (curTableAttrs != null && (attrs == null || attrs["table"] == null) && text == "\n")
                    {
                        List<XNode> nextBlockNodes = RowEnded(childNodes, ref curRowAttrs);
                        TableEnded(content, childNodes, ref curTableAttrs);
                        childNodes.Peek().AddRange(nextBlockNodes);
                    }
                    else if (attrs != null && attrs["table"] != null)
                    {
                        var cellAttrs = (JObject)attrs["cell"];
                        XElement cellElem;
                        if (cellAttrs != null)
                            cellElem = CreateContainerElement("cell", cellAttrs, childNodes.Peek());
                        else
                            cellElem = (XElement)childNodes.Peek().Single();
                        childNodes.Pop();

                        var tableAttrs = (JObject)attrs["table"];
                        var rowAttrs = (JObject)attrs["row"];
                        if (curTableAttrs != null)
                        {
                            if ((string)rowAttrs["id"] != (string)curRowAttrs["id"])
                                RowEnded(childNodes, ref curRowAttrs);
                            if ((string)tableAttrs["id"] != (string)curTableAttrs["id"])
                                TableEnded(content, childNodes, ref curTableAttrs);
                        }

                        while (childNodes.Count < 2)
                            childNodes.Push(new List<XNode>());
                        childNodes.Peek().Add(cellElem);
                        childNodes.Push(new List<XNode>());

                        curTableAttrs = tableAttrs;
                        curRowAttrs = rowAttrs;
                    }

                    if (attrs == null)
                    {
                        if (text.Length > 1 && text.EndsWith('\n'))
                        {
                            // Combine implied paragraphs since USX only supports one (not expecting more than one tho).
                            string[] impliedParagraphs = text.Split('\n', StringSplitOptions.RemoveEmptyEntries);
                            childNodes.Peek().Add(new XText(string.Join("", impliedParagraphs)));
                            text = "\n";
                        }

                        if (text == "\n")
                        {
                            content.AddRange(childNodes.Peek());
                            childNodes.Peek().Clear();
                            continue;
                        }
                        childNodes.Peek().Add(new XText(text));
                    }
                    else
                    {
                        // text blots
                        foreach (JProperty prop in attrs.Properties())
                        {
                            switch (prop.Name)
                            {
                                case "para":
                                    // end of a para block
                                    for (int j = 0; j < text.Length; j++)
                                        content.Add(CreateContainerElement("para", prop.Value, childNodes.Peek()));
                                    childNodes.Peek().Clear();
                                    break;

                                case "ref":
                                    XElement refElem = CreateContainerElement("ref", prop.Value, text);
                                    childNodes.Peek().Add(refElem);
                                    break;

                                case "char":
                                    if (attrs["ref"] == null)
                                        childNodes.Peek().Add(new XText(text));
                                    break;

                                case "segment":
                                    if (attrs.Count == 1)
                                        childNodes.Peek().Add(new XText(text));
                                    break;
                            }
                        }
                    }
                }
                else
                {
                    // embeds
                    var obj = (JObject)op[Delta.InsertType];
                    foreach (JProperty prop in obj.Properties())
                    {
                        switch (prop.Name)
                        {
                            case "chapter":
                                XElement chapterElem = new XElement("chapter");
                                AddAttributes(chapterElem, prop.Value);
                                content.Add(chapterElem);
                                break;

                            case "blank":
                            case "empty":
                                // ignore blank and empty embeds
                                break;

                            default:
                                XElement embedElem = new XElement(prop.Name);
                                AddAttributes(embedElem, prop.Value);
                                if (prop.Value["contents"] != null)
                                {
                                    var contentsDelta = new Delta(prop.Value["contents"]["ops"].Children());
                                    embedElem.Add(ProcessDelta(contentsDelta));
                                }
                                childNodes.Peek().Add(embedElem);
                                break;
                        }
                    }


                }
            }
            while (curCharAttrs.Count > 0)
                CharEnded(childNodes, curCharAttrs);
            if (curTableAttrs != null)
            {
                RowEnded(childNodes, ref curRowAttrs);
                TableEnded(content, childNodes, ref curTableAttrs);
            }
            content.AddRange(childNodes.Pop());
            return content;
        }

        private static bool CharAttributesMatch(List<JObject> curCharAttrs, List<JObject> charAttrs)
        {
            if (curCharAttrs.Count > charAttrs.Count)
                return false;

            for (int i = 0; i < curCharAttrs.Count; i++)
            {
                if (!JToken.DeepEquals(curCharAttrs[i], charAttrs[i]))
                    return false;
            }
            return true;
        }

        private static List<JObject> GetCharAttributes(JToken charAttrs)
        {
            switch (charAttrs)
            {
                case JArray array:
                    return new List<JObject>(array.Children<JObject>());

                case JObject obj:
                    return new List<JObject> { obj };
            }
            return new List<JObject>();
        }

        private static JObject RemoveCharAttributes(ref JToken curChar)
        {
            JObject charAttrs = null;
            switch (curChar)
            {
                case JArray array:
                    charAttrs = (JObject)array.Last;
                    array.Remove(charAttrs);
                    if (array.Count == 1)
                        curChar = array.First;
                    break;

                case JObject obj:
                    charAttrs = obj;
                    curChar = null;
                    break;
            }
            return charAttrs;
        }

        private static XElement CreateContainerElement(string name, JToken attributes, object content = null)
        {
            var elem = new XElement(name);
            AddAttributes(elem, attributes);
            if (content != null)
                elem.Add(content);
            return elem;
        }

        private static void AddAttributes(XElement elem, JToken attributes)
        {
            var attrsObj = (JObject)attributes;
            foreach (JProperty prop in attrsObj.Properties())
            {
                if (prop.Value.Type != JTokenType.String || prop.Name == "id" || prop.Name == "invalid")
                    continue;
                elem.Add(new XAttribute(prop.Name, (string)prop.Value));
            }
        }

        private static void CharEnded(Stack<List<XNode>> childNodes, List<JObject> curCharAttrs)
        {
            JObject charAttrs = curCharAttrs[curCharAttrs.Count - 1];
            curCharAttrs.RemoveAt(curCharAttrs.Count - 1);
            if (charAttrs.ContainsKey("cid"))
            {
                charAttrs = (JObject)charAttrs.DeepClone();
                charAttrs.Property("cid").Remove();
            }
            XElement charElem = CreateContainerElement("char", charAttrs, childNodes.Peek());
            childNodes.Pop();
            childNodes.Peek().Add(charElem);
        }

        private static List<XNode> RowEnded(Stack<List<XNode>> childNodes, ref JObject curRowAttrs)
        {
            if (childNodes.Count > 3)
                throw new InvalidOperationException("A table is not valid in the current location.");

            List<XNode> nextBlockNodes = null;
            if (childNodes.Count == 3)
                nextBlockNodes = childNodes.Pop();
            XElement rowElem = CreateContainerElement("row", new JObject(new JProperty("style", "tr")),
                childNodes.Peek());
            childNodes.Pop();
            childNodes.Peek().Add(rowElem);
            curRowAttrs = null;
            return nextBlockNodes;
        }

        private static void TableEnded(List<XNode> content, Stack<List<XNode>> childNodes, ref JObject curTableAttrs)
        {
            content.Add(CreateContainerElement("table", curTableAttrs, childNodes.Peek()));
            childNodes.Peek().Clear();
            curTableAttrs = null;
        }

        private static bool IsElement(XNode node, string name)
        {
            var elem = node as XElement;
            return elem != null && elem.Name.LocalName == name;
        }
    }
}
