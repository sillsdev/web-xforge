using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using SIL.XForge.Realtime.RichText;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

public static class DeltaUsxTestExtensions
{
    /// <summary>
    /// This method should be called when a paragraph _ends_, not begins.
    /// </summary>
    public static Delta InsertPara(this Delta delta, string style, bool invalid = false)
    {
        var obj = new JObject(new JProperty("style", style));
        if (style == "")
            obj.Add(new JProperty("status", "unknown"));
        JObject attrs = null;
        if (invalid)
            attrs = new JObject(new JProperty("invalid-block", true));
        return delta.InsertPara(obj, attrs);
    }

    public static Delta InsertNote(
        this Delta delta,
        Delta contents,
        string style,
        string caller,
        string segRef,
        bool invalid = false
    )
    {
        var obj = new JObject(
            new JProperty("style", style),
            new JProperty("caller", caller),
            new JProperty("contents", SerializeDelta(contents))
        );
        JObject attrs = null;
        if (invalid)
            attrs = new JObject(new JProperty("invalid-inline", true));
        return delta.InsertEmbed("note", obj, segRef, attrs);
    }

    public static Delta InsertFigure(
        this Delta delta,
        string file,
        string size,
        string reference,
        string text,
        string segRef,
        bool invalid = false
    )
    {
        var obj = new JObject(new JProperty("style", "fig"));
        if (file != null)
            obj.Add(new JProperty("file", file));
        if (size != null)
            obj.Add(new JProperty("size", size));
        if (reference != null)
            obj.Add(new JProperty("ref", reference));
        if (text != null)
            obj.Add(new JProperty("contents", SerializeDelta(Delta.New().Insert(text))));
        JObject attrs = null;
        if (invalid)
            attrs = new JObject(new JProperty("invalid-inline", true));
        return delta.InsertEmbed("figure", obj, segRef, attrs);
    }

    public static Delta InsertChar(
        this Delta delta,
        string text,
        string style,
        string cid,
        string segRef = null,
        bool invalid = false
    )
    {
        var attributes = new JObject(
            new JProperty("char", new JObject(new JProperty("style", style), new JProperty("cid", cid)))
        );
        if (invalid)
            attributes.Add(new JProperty("invalid-inline", true));
        return delta.InsertText(text, segRef, attributes);
    }

    public static Delta InsertChar(
        this Delta delta,
        string text,
        IEnumerable<CharAttr> charAttrs,
        string segRef = null,
        bool invalid = false
    )
    {
        var attributes = new JObject(
            new JProperty(
                "char",
                charAttrs.Select(charAttr => new JObject(
                    new JProperty("style", charAttr.Style),
                    new JProperty("cid", charAttr.CharID)
                ))
            )
        );
        if (invalid)
            attributes.Add(new JProperty("invalid-inline", true));
        return delta.InsertText(text, segRef, attributes);
    }

    public static Delta InsertEmptyChar(
        this Delta delta,
        string style,
        string cid,
        string segRef = null,
        bool invalid = false
    )
    {
        var attributes = new JObject(
            new JProperty("char", new JObject(new JProperty("style", style), new JProperty("cid", cid)))
        );
        if (invalid)
            attributes.Add(new JProperty("invalid-inline", true));
        return delta.InsertEmpty(segRef, attributes);
    }

    public static Delta InsertCharRef(
        this Delta delta,
        string text,
        string style,
        string reference,
        string cid,
        string segRef = null,
        bool invalid = false
    )
    {
        var attributes = new JObject(
            new JProperty("char", new JObject(new JProperty("style", style), new JProperty("cid", cid))),
            new JProperty("ref", new JObject(new JProperty("loc", reference)))
        );
        if (invalid)
            attributes.Add(new JProperty("invalid-inline", true));
        return delta.InsertText(text, segRef, attributes);
    }

    public static Delta InsertBook(this Delta delta, string code, string style = "id", bool invalid = false)
    {
        var obj = new JObject(new JProperty("code", code), new JProperty("style", style));
        if (style == "")
            obj.Add(new JProperty("status", "unknown"));
        JObject attrs = [];
        if (invalid)
            attrs = new JObject(new JProperty("invalid-block", true));
        attrs.Add(new JProperty("book", obj));
        return delta.InsertBlank($"{style}_1").Insert("\n", attrs);
    }

    public static Delta InsertChapter(this Delta delta, string number, string style = "c", bool invalid = false)
    {
        var obj = new JObject(new JProperty("number", number), new JProperty("style", style));
        JObject attrs = null;
        if (invalid)
            attrs = new JObject(new JProperty("invalid-block", true));
        return delta.InsertEmbed("chapter", obj, attributes: attrs);
    }

    public static Delta InsertVerse(this Delta delta, string number, string style = "v", bool invalid = false)
    {
        var obj = new JObject(new JProperty("number", number), new JProperty("style", style));
        JObject attrs = null;
        if (invalid)
            attrs = new JObject(new JProperty("invalid-inline", true));
        return delta.InsertEmbed("verse", obj, attributes: attrs);
    }

    public static Delta InsertOptBreak(this Delta delta, string segRef = null) =>
        delta.InsertEmbed("optbreak", [], segRef);

    public static Delta InsertMilestone(this Delta delta, string style, string segRef = null, bool invalid = false)
    {
        var obj = new JObject(new JProperty("style", style));
        JObject attrs = null;
        if (invalid)
            attrs = new JObject(new JProperty("invalid-inline", true));
        return delta.InsertEmbed("ms", obj, segRef, attrs);
    }

    /// <summary>
    /// This is called _after_ a cell's contents, not before.
    /// </summary>
    public static Delta InsertCell(
        this Delta delta,
        int table,
        int row,
        string style,
        string align,
        bool invalid = false
    )
    {
        var attrs = new JObject(
            new JProperty("table", new JObject(new JProperty("id", $"table_{table}"))),
            new JProperty("row", new JObject(new JProperty("id", $"row_{table}_{row}"))),
            new JProperty("cell", new JObject(new JProperty("style", style), new JProperty("align", align)))
        );
        if (invalid)
            attrs.Add(new JProperty("invalid-block", true));
        return delta.Insert("\n", attrs);
    }

    private static JObject SerializeDelta(Delta delta) => new JObject(new JProperty("ops", new JArray(delta.Ops)));
}
