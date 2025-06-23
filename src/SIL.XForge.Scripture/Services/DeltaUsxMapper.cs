using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Xml.Linq;
using System.Xml.Schema;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;
using SIL.XForge.Realtime.RichText;

namespace SIL.XForge.Scripture.Services;

public class DeltaUsxMapper(
    IGuidService guidService,
    ILogger<DeltaUsxMapper> logger,
    IExceptionHandler exceptionHandler
) : IDeltaUsxMapper
{
    private static readonly XmlSchemaSet Schemas = CreateSchemaSet();

    private static XmlSchemaSet CreateSchemaSet()
    {
        var schemas = new XmlSchemaSet();
        schemas.Add("", "usx-sf.xsd");
        schemas.Compile();
        return schemas;
    }

    ///<summary>
    /// Paragraph, Poetry, and List styles. This indicates paragraph styles that can contain verse text. For example, s
    /// is not included in the set, because it cannot contain verse text. See also text-view-model.ts PARA_STYLES.
    ///</summary>
    private static readonly HashSet<string> ParagraphPoetryListStyles =
    [
        // Paragraphs
        "p",
        "nb",
        "m",
        "po",
        "pr",
        "cls",
        "pmo",
        "pm",
        "pmc",
        "pmr",
        "pi",
        "mi",
        "pc",
        "ph",
        "lit",
        // Poetry
        "q",
        "qr",
        "qc",
        "qa",
        "qm",
        "qd",
        // Lists
        "lh",
        "li",
        "lf",
        "lim",
        // Should not contain verse text, but sometimes do
        "b",
        // Book
        "id",
    ];

    private class ParseState
    {
        public string? CurRef { get; set; }
        public string? CurChapter { get; set; }
        public bool CurChapterIsValid { get; set; } = true;
        public int TableIndex { get; set; }
        public bool ImpliedParagraph { get; set; }
        public int LastVerse { get; set; }
        public string? LastVerseStr
        {
            set
            {
                if (value != null)
                {
                    int lastVerse = LastVerse;
                    int dashIndex = value.IndexOf('-');
                    if (dashIndex != -1)
                        value = value[(dashIndex + 1)..];
                    if (int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out int lastVerseInt))
                        lastVerse = lastVerseInt;
                    LastVerse = lastVerse;
                }
            }
        }
    }

    public static bool CanParaContainVerseText(string? style)
    {
        // an empty style indicates an improperly formatted paragraph which could contain verse text
        if (string.IsNullOrEmpty(style))
            return true;
        if (char.IsDigit(style[^1]))
            style = style[..^1];
        // paragraph, poetry, and list styles are the only types of valid paras that can contain verse text
        return ParagraphPoetryListStyles.Contains(style);
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
        usxDoc.Validate(
            Schemas,
            (o, _) =>
            {
                XNode node;
                if (o is XAttribute attr)
                    node = attr.Parent;
                else
                    node = (XNode)o;
                invalidNodes.Add(node);
            },
            true
        );
        var chapterDeltas = new List<ChapterDelta>();
        var chapterDelta = new Delta();
        var nextIds = new Dictionary<string, int>();
        var state = new ParseState();
        bool bookIsValid = true;
        foreach (XNode node in usxDoc.Element("usx")!.Nodes())
        {
            switch (node)
            {
                case XElement elem:
                    switch (elem.Name.LocalName)
                    {
                        case "book":
                            // Check for book validity. The list of valid books are in the XSD
                            bookIsValid = elem.GetSchemaInfo()?.Validity == XmlSchemaValidity.Valid;

                            // Insert the USFM \id tag as book element (as it is in USX), using the para logic
                            goto case "para";

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
                                    int slashIndex = state.CurRef.IndexOf('/', StringComparison.Ordinal);
                                    if (slashIndex != -1)
                                        state.CurRef = state.CurRef[..slashIndex];
                                    state.CurRef = GetParagraphRef(nextIds, state.CurRef, state.CurRef + "/" + style);
                                }
                                else
                                {
                                    state.CurRef = GetParagraphRef(nextIds, style, style);
                                }
                            }
                            else
                            {
                                state.CurRef = GetParagraphRef(nextIds, style, style);
                            }
                            ProcessChildNodes(elem, chapterDelta, invalidNodes, state);
                            SegmentEnded(chapterDelta, state.CurRef);
                            if (!canContainVerseText)
                                state.CurRef = null;
                            InsertPara(elem, chapterDelta, invalidNodes, state);
                            break;

                        case "chapter":
                            if (state.CurChapter != null)
                            {
                                ChapterEnded(chapterDeltas, chapterDelta, state);
                                nextIds.Clear();
                                chapterDelta = new Delta();

                                // The book must be valid for the chapter to be valid
                                state.CurChapterIsValid = bookIsValid;
                            }
                            state.CurRef = null;
                            state.LastVerse = 0;
                            state.CurChapter = (string)elem.Attribute("number");
                            chapterDelta.InsertEmbed(
                                "chapter",
                                GetAttributes(elem),
                                attributes: AddInvalidBlockAttribute(invalidNodes, elem)
                            );
                            break;

                        // According to the USX schema, a verse or note should only occur within a paragraph,
                        // but Paratext 9.0 can still generate USX with verses or notes at the chapter level.
                        case "verse":
                        case "note":
                            ProcessChildNode(elem, chapterDelta, invalidNodes, state);
                            state.ImpliedParagraph = true;
                            break;

                        default:
                            ProcessChildNode(elem, chapterDelta, invalidNodes, state);
                            break;
                    }
                    if (elem.GetSchemaInfo().Validity != XmlSchemaValidity.Valid)
                        state.CurChapterIsValid = false;
                    break;

                case XText text:
                    chapterDelta.InsertText(text.Value, state.CurRef, AddInvalidInlineAttribute(invalidNodes, text));
                    state.ImpliedParagraph = true;
                    break;
            }
        }
        state.CurChapter ??= "1";
        ChapterEnded(chapterDeltas, chapterDelta, state);
        return chapterDeltas;
    }

    private void ProcessChildNodes(XElement parentElem, Delta newDelta, HashSet<XNode> invalidNodes) =>
        ProcessChildNodes(parentElem, newDelta, invalidNodes, new ParseState());

    private void ProcessChildNodes(
        XElement parentElem,
        Delta newDelta,
        HashSet<XNode> invalidNodes,
        ParseState state,
        JObject? attributes = null
    )
    {
        foreach (XNode node in parentElem.Nodes())
            ProcessChildNode(node, newDelta, invalidNodes, state, attributes);
    }

    private void ProcessChildNode(
        XNode node,
        Delta newDelta,
        HashSet<XNode> invalidNodes,
        ParseState state,
        JObject? attributes = null
    )
    {
        switch (node)
        {
            case XElement elem:
                switch (elem.Name.LocalName)
                {
                    case "para":
                        ProcessChildNodes(elem, newDelta, invalidNodes);
                        InsertPara(elem, newDelta, invalidNodes, state);
                        break;

                    case "verse":
                        state.LastVerseStr = (string)elem.Attribute("number");
                        InsertVerse(elem, newDelta, invalidNodes, state);
                        break;

                    case "ref":
                        var newRefAttributes = (JObject)attributes?.DeepClone() ?? [];
                        newRefAttributes.Add(new JProperty(elem.Name.LocalName, GetAttributes(elem)));
                        newRefAttributes = AddInvalidInlineAttribute(invalidNodes, elem, newRefAttributes);
                        newDelta.InsertText(elem.Value, state.CurRef, newRefAttributes);
                        break;

                    case "char":
                        var newChildAttributes = (JObject)attributes?.DeepClone() ?? [];
                        JToken existingCharAttrs = newChildAttributes["char"];
                        JObject newCharAttrs = GetAttributes(elem);
                        if (!newCharAttrs.ContainsKey("cid"))
                            newCharAttrs.Add("cid", guidService.Generate());

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
                            newDelta.InsertText(elem.Value, state.CurRef, newChildAttributes);
                        else
                            ProcessChildNodes(elem, newDelta, invalidNodes, state, newChildAttributes);
                        break;

                    case "table":
                        state.TableIndex++;
                        JObject tableAttributes = GetAttributes(elem);
                        tableAttributes.Add(new JProperty("id", $"table_{state.TableIndex}"));
                        int rowIndex = 1;
                        foreach (XElement row in elem.Elements("row"))
                        {
                            var rowAttributes = new JObject(new JProperty("id", $"row_{state.TableIndex}_{rowIndex}"));
                            int cellIndex = 1;
                            foreach (XElement cell in row.Elements())
                            {
                                state.CurRef = $"cell_{state.TableIndex}_{rowIndex}_{cellIndex}";
                                ProcessChildNode(cell, newDelta, invalidNodes, state);
                                SegmentEnded(newDelta, state.CurRef);
                                var attrs = new JObject(
                                    new JProperty("table", tableAttributes),
                                    new JProperty("row", rowAttributes)
                                );
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
                        ProcessChildNodes(elem, newDelta, invalidNodes, state);
                        break;

                    default:
                        InsertEmbed(elem, newDelta, invalidNodes, state.CurRef, attributes);
                        break;
                }
                break;

            case XText text:
                newDelta.InsertText(
                    text.Value,
                    state.CurRef,
                    AddInvalidInlineAttribute(invalidNodes, text, attributes)
                );
                break;
        }
    }

    private static void ChapterEnded(List<ChapterDelta> chapterDeltas, Delta chapterDelta, ParseState state)
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

    private static void InsertVerse(XElement elem, Delta newDelta, HashSet<XNode> invalidNodes, ParseState state)
    {
        var verse = (string)elem.Attribute("number");
        SegmentEnded(newDelta, state.CurRef);
        state.CurRef = $"verse_{state.CurChapter}_{verse}";
        newDelta.InsertEmbed("verse", GetAttributes(elem), attributes: AddInvalidInlineAttribute(invalidNodes, elem));
    }

    private void InsertEmbed(
        XElement elem,
        Delta newDelta,
        HashSet<XNode> invalidNodes,
        string curRef,
        JObject attributes
    )
    {
        JObject obj = GetAttributes(elem);
        var contents = new Delta();
        ProcessChildNodes(elem, contents, invalidNodes);
        if (contents.Ops.Count > 0)
        {
            obj.Add(new JProperty("contents", new JObject(new JProperty("ops", new JArray(contents.Ops)))));
        }
        newDelta.InsertEmbed(
            elem.Name.LocalName,
            obj,
            curRef,
            AddInvalidInlineAttribute(invalidNodes, elem, attributes)
        );
    }

    private static void InsertPara(XElement elem, Delta newDelta, HashSet<XNode> invalidNodes, ParseState state)
    {
        string style = elem.Attribute("style")?.Value;
        bool canContainVerseText = CanParaContainVerseText(style);
        if (!canContainVerseText && elem.Descendants("verse").Any())
        {
            invalidNodes.Add(elem);
            state.CurChapterIsValid = false;
        }

        JObject attributes = (JObject)AddInvalidBlockAttribute(invalidNodes, elem)?.DeepClone() ?? [];

        // Map to the element name, so para and book can preserve their mapping to usx-para and usx-book
        attributes.Add(new JProperty(elem.Name.LocalName, GetAttributes(elem)));
        newDelta.Insert("\n", attributes);
    }

    private static void SegmentEnded(Delta newDelta, string? segRef)
    {
        if (segRef == null)
            return;

        if (newDelta.Ops.Count == 0)
        {
            newDelta.InsertText(string.Empty, segRef);
        }
        else
        {
            JToken lastOp = newDelta.Ops[^1];
            string lastOpText = "";
            if (lastOp[Delta.InsertType].Type == JTokenType.String)
                lastOpText = (string)lastOp[Delta.InsertType];
            var embed = lastOp[Delta.InsertType] as JObject;
            var attrs = (JObject)lastOp[Delta.Attributes];
            if (
                (embed != null && (embed["verse"] != null || embed["chapter"] != null))
                || (attrs != null && (attrs["book"] != null || attrs["para"] != null || attrs["table"] != null))
                || lastOpText.EndsWith('\n')
            )
            {
                newDelta.InsertText(string.Empty, segRef);
            }
        }
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

    private static JObject? AddInvalidInlineAttribute(
        HashSet<XNode> invalidNodes,
        XNode node,
        JObject? attributes = null
    )
    {
        if (invalidNodes.Contains(node))
        {
            attributes = (JObject)attributes?.DeepClone() ?? [];
            attributes["invalid-inline"] = true;
        }
        return attributes;
    }

    private static JObject? AddInvalidBlockAttribute(
        HashSet<XNode> invalidNodes,
        XNode node,
        JObject? attributes = null
    )
    {
        if (invalidNodes.Contains(node))
        {
            attributes = (JObject)attributes?.DeepClone() ?? [];
            attributes["invalid-block"] = true;
        }
        return attributes;
    }

    /// <summary>
    /// It may be that this method is taking USX, leaving alone all chapters not specified and valid in
    /// chapterDeltas, leaving alone most chapters not already present in oldUsxDoc, and then replacing
    /// all chapters in the USX, that are in chapterDeltas and valid, with the data from the chapterDeltas.
    /// </summary>
    public XDocument ToUsx(XDocument oldUsxDoc, IEnumerable<ChapterDelta> chapterDeltas)
    {
        var newUsxDoc = new XDocument(oldUsxDoc);
        bool isFirstChapterFound = false;
        ChapterDelta[] chapterDeltaArray = [.. chapterDeltas];
        int curChapterDeltaIndex = 0;
        int curChapter = chapterDeltaArray[curChapterDeltaIndex].Number;
        try
        {
            if (chapterDeltaArray.Length == 1 && chapterDeltaArray[0]?.Delta.Ops.Count == 0)
            {
                int usxChapterCount = oldUsxDoc.Root!.Nodes().Count(node => IsElement(node, "chapter"));
                // The chapterDeltas indicate this may be a book in the SF DB with no chapters, but the USX
                // indicates that we should have known there were chapters and previously recorded them in
                // the SF DB.
                if (usxChapterCount > 0)
                {
                    string errorExplanation =
                        "ToUsx() received a chapterDeltas with no real chapters "
                        + $"(just one 'chapter' with a Delta.Ops.Count of 0), and USX with {usxChapterCount} "
                        + "chapters. This may indicate corrupt data in the SF DB. Handling by ignoring "
                        + "chapterDeltas and returning the input USX.";
                    logger.LogWarning(errorExplanation);
                    // Report to bugsnag, but don't throw.
                    var report = new ArgumentException(errorExplanation);
                    exceptionHandler.ReportException(report);
                }
                return oldUsxDoc;
            }
            foreach (XNode curNode in newUsxDoc.Root!.Nodes().ToArray())
            {
                if (IsElement(curNode, "chapter"))
                {
                    if (isFirstChapterFound)
                    {
                        ChapterDelta chapterDelta = chapterDeltaArray[curChapterDeltaIndex];
                        if (chapterDelta.Number == curChapter)
                        {
                            if (chapterDelta.IsValid)
                                curNode.AddBeforeSelf(ProcessDelta(chapterDelta.Delta));
                            curChapterDeltaIndex++;
                        }
                        var numberStr = (string)((XElement)curNode).Attribute("number");
                        if (int.TryParse(numberStr, out int number))
                            curChapter = number;

                        if (curChapterDeltaIndex >= chapterDeltaArray.Length)
                            return newUsxDoc;
                        chapterDelta = chapterDeltaArray[curChapterDeltaIndex];
                        while (chapterDelta.Number < curChapter)
                        {
                            // Add new chapters in our deltas to the usx doc
                            if (chapterDelta.IsValid)
                                curNode.AddAfterSelf(ProcessDelta(chapterDelta.Delta));
                            curChapterDeltaIndex++;
                            chapterDelta = chapterDeltaArray[curChapterDeltaIndex];
                        }
                    }
                    else
                    {
                        isFirstChapterFound = true;
                        var numberStr = (string)((XElement)curNode).Attribute("number");
                        if (!int.TryParse(numberStr, out int number))
                        {
                            // we cannot handle if the first chapter is invalid because we have no way to determine
                            // how to update the content before this chapter
                            throw new InvalidDataException("The first chapter number was invalid");
                        }
                    }
                }

                if (curChapterDeltaIndex >= chapterDeltaArray.Length)
                {
                    return newUsxDoc;
                }

                bool currentChapterIsValid =
                    chapterDeltaArray[curChapterDeltaIndex].Number == curChapter
                    && chapterDeltaArray[curChapterDeltaIndex].IsValid;

                bool hasBookOp = chapterDeltaArray[curChapterDeltaIndex]
                    .Delta.Ops.Any(o => o["attributes"]?["book"] is not null);

                // If the chapter is valid, or if it is a book element, and we have a book op
                if (currentChapterIsValid && (!IsElement(curNode, "book") || hasBookOp))
                {
                    curNode.Remove();
                }
            }

            for (int i = curChapterDeltaIndex; i < chapterDeltaArray.Length; i++)
            {
                if (chapterDeltaArray[i].IsValid)
                    newUsxDoc.Root.Add(ProcessDelta(chapterDeltaArray[i].Delta));
            }
            return newUsxDoc;
        }
        catch (InvalidDataException)
        {
            throw;
        }
        catch (Exception e)
        {
            int usxChapterCount = oldUsxDoc.Root.Nodes().Count(node => IsElement(node, "chapter"));
            string errorExplanation =
                $"ToUsx() had a problem ({e.Message}). SF DB corruption can cause "
                + "IndexOutOfRangeException to be thrown here. Rethrowing. Diagnostic info: "
                + $"chapterDeltas length is {chapterDeltaArray.Length}, "
                + $"The first chapterDeltas Delta.Ops.Count is "
                + $"{chapterDeltaArray.ElementAtOrDefault(0)?.Delta.Ops.Count}, "
                + $"The input oldUsxDoc has this many chapter elements: {usxChapterCount}, "
                + $"curChapterDeltaIndex is {curChapterDeltaIndex}, isFirstChapterFound is {isFirstChapterFound}.";
            throw new Exception(errorExplanation, e);
        }
    }

    /// <summary>
    /// Checks if the provided Delta object can be converted to a valid USX document.
    /// </summary>
    /// <param name="delta">The Delta object to validate.</param>
    /// <param name="usxVersion">The USX version number to set on the root element. Defaults to 1.0.</param>
    public static bool IsDeltaValid(Delta delta, double usxVersion = 1)
    {
        List<XNode> xNodes = ProcessDelta(delta);
        XElement usxRootElement = new XElement("usx", xNodes);
        usxRootElement.SetAttributeValue("version", string.Format("{0:0.0}", usxVersion));
        XDocument usx = new XDocument(usxRootElement);
        bool isValid = true;
        usx.Validate(Schemas, (_, _) => isValid = false);

        return isValid;
    }

    /// <summary>
    /// Make USX from a Delta's ops.
    /// </summary>
    private static List<XNode> ProcessDelta(Delta delta)
    {
        // Output XML.
        List<XNode> content = [];
        // Outer-to-inner set of nested character formatting, which applies to top childNodes elements.
        List<JObject> curCharAttrs = [];
        // In-progress nested text and formatting, with the top of the stack representing the inner part of the nesting.
        // Each element contains a first-to-last set of XML nodes.
        Stack<List<XNode>> childNodes = [];
        childNodes.Push([]);
        JObject curTableAttrs = null;
        JObject curRowAttrs = null;
        foreach (JToken op in delta.Ops)
        {
            if (op.OpType() != Delta.InsertType)
                throw new ArgumentException("The delta is not a document.", nameof(delta));

            var attrs = (JObject)op[Delta.Attributes];
            // If we were tracking character attributes for childNodes, but the text being inserted by the current op
            // does not have any character attributes, then record char XML elements for all tracked character
            // attributes.
            if (curCharAttrs.Count > 0 && attrs?["char"] == null)
            {
                while (curCharAttrs.Count > 0)
                    CharEnded(childNodes, curCharAttrs);
            }
            else if (attrs?["char"] != null)
            {
                List<JObject> charAttrs = GetCharAttributes(attrs["char"]);
                // Record character formatting for existing text if it does not apply to the text being inserted in the
                // current op. If the op's character attributes set doesn't start with the character attributes that
                // were being tracked, start recording char XML elements for the tracked character attributes until
                // either we run out of them, or the tracked character attributes set matches the beginning of the
                // current op's character attributes.
                while (curCharAttrs.Count > 0 && !CharAttributesMatch(curCharAttrs, charAttrs))
                    CharEnded(childNodes, curCharAttrs);
                // If the current op is inserting text with formatting that is not already being tracked for the
                // existing text, prepare places to isolate the new text that the new formatting will apply to.
                for (int i = curCharAttrs.Count; i < charAttrs.Count; i++)
                    childNodes.Push([]);
                curCharAttrs = charAttrs;
            }

            // If we are inserting a basic string, rather than a more complex object, like a chapter number.
            if (op[Delta.InsertType].Type == JTokenType.String)
            {
                string text = (string)op[Delta.InsertType];

                // Skip blanks
                if (string.IsNullOrEmpty(text))
                {
                    continue;
                }

                // If we were recently working with table information, but the current op doesn't describe the end of a
                // table cell, and we seem to be done with the table, then end the table.
                if (curTableAttrs != null && attrs?["table"] == null && text == "\n")
                {
                    List<XNode> nextBlockNodes = RowEnded(childNodes, ref curRowAttrs);
                    TableEnded(content, childNodes, ref curTableAttrs);
                    childNodes.Peek().AddRange(nextBlockNodes);
                }
                // If we just finished a table cell. Account for being in a new row or new table than last time we
                // observed. Take the top childNodes node-set and put it into a cell XML element. Leave childNodes with
                // an empty node-set at the top for upcoming content, followed by a node-set with the cell XML element appended,
                // followed by at least one more node-set (possibly being existing content).
                else if (attrs?["table"] != null)
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
                    // If we were already processing table cells for this table.
                    if (curTableAttrs != null)
                    {
                        if ((string)rowAttrs["id"] != (string)curRowAttrs["id"])
                            RowEnded(childNodes, ref curRowAttrs);
                        if ((string)tableAttrs["id"] != (string)curTableAttrs["id"])
                            TableEnded(content, childNodes, ref curTableAttrs);
                    }

                    while (childNodes.Count < 2)
                        childNodes.Push([]);
                    childNodes.Peek().Add(cellElem);
                    childNodes.Push([]);

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
                            case "book":
                            case "para":
                                // end of a book or para block
                                for (int j = 0; j < text.Length; j++)
                                    content.Add(CreateContainerElement(prop.Name, prop.Value, childNodes.Peek()));
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
                            // If there is a table before the chapter (i.e. in an introduction), end it
                            if (curTableAttrs != null)
                            {
                                RowEnded(childNodes, ref curRowAttrs);
                                TableEnded(content, childNodes, ref curTableAttrs);
                            }

                            XElement chapterElem = new XElement("chapter");
                            AddAttributes(chapterElem, prop.Value);
                            content.Add(chapterElem);
                            break;

                        case "blank":
                        case "empty":
                            // Ignore legacy blank and empty embeds
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

    /// <summary>
    /// If <param name="charAttrs"/> is a subset of <param name="curCharAttrs"/>.
    /// </summary>
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

    /// <summary>
    /// Return a List JObject from the incoming charAttrs, dealing with different possible types.
    /// </summary>
    private static List<JObject> GetCharAttributes(JToken charAttrs)
    {
        return charAttrs switch
        {
            JArray array => [.. array.Children<JObject>()],
            JObject obj => [obj],
            _ => [],
        };
    }

    /// <summary>
    /// Create XML element of a given name, with attributes and optional children content.
    /// </summary>
    private static XElement CreateContainerElement(string name, JToken attributes, object? content = null)
    {
        var elem = new XElement(name);
        AddAttributes(elem, attributes);
        if (content != null)
            elem.Add(content);
        return elem;
    }

    /// <summary>
    /// Add XML attributes to elem.
    /// </summary>
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

    /// <summary>
    /// Apply last `curCharAttrs` character formatting to the top`childNodes` element.
    ///
    /// Take off the last description from `curCharAttrs"`. Use it to describe the attributes of a new char
    /// XML element. Take off and put the first `childNodes` node-set as the char XML element's content,
    /// and then append the char element to the next `childNodes` node-set.
    /// </summary>
    private static void CharEnded(Stack<List<XNode>> childNodes, List<JObject> curCharAttrs)
    {
        JObject charAttrs = curCharAttrs[^1];
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

    /// <summary>
    /// Create an XML row element using the second-from the bottom `childNodes` node-set as content, and
    /// append it to the bottom `childNodes` node-set. Return the top node-set if there were 3. Leave
    /// childNodes as only the bottom node-set.
    /// </summary>
    private static List<XNode>? RowEnded(Stack<List<XNode>> childNodes, ref JObject? curRowAttrs)
    {
        if (childNodes.Count > 3)
            throw new InvalidOperationException("A table is not valid in the current location.");

        List<XNode> nextBlockNodes = null;
        if (childNodes.Count == 3)
            nextBlockNodes = childNodes.Pop();
        XElement rowElem = CreateContainerElement("row", new JObject(new JProperty("style", "tr")), childNodes.Peek());
        childNodes.Pop();
        childNodes.Peek().Add(rowElem);
        curRowAttrs = null;
        return nextBlockNodes;
    }

    /// <summary>
    /// Create an XML table element using the top `childNodes` node-set as content, and append it to
    /// `content`.
    /// </summary>
    private static void TableEnded(List<XNode> content, Stack<List<XNode>> childNodes, ref JObject? curTableAttrs)
    {
        content.Add(CreateContainerElement("table", curTableAttrs, childNodes.Peek()));
        childNodes.Peek().Clear();
        curTableAttrs = null;
    }

    private static bool IsElement(XNode node, string name) => node is XElement elem && elem.Name.LocalName == name;
}
