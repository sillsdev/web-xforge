using System.Xml.Linq;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Builders for the USX documents that tests feed to <see cref="DeltaUsxMapper"/>. Shared by the mapper tests and
/// by tests of consumers of the mapper's output (such as <see cref="TextProgressService"/>), so that both suites
/// describe fixtures in the same vocabulary. Use with <c>using static</c>.
/// </summary>
public static class UsxTestHelpers
{
    public static XDocument Usx(string code, string? bookInnerText, string usxVersion, params object[] elems) =>
        new XDocument(new XElement("usx", new XAttribute("version", usxVersion), Book(code, bookInnerText), elems));

    public static XDocument Usx(string code, params object[] elems) =>
        new XDocument(new XElement("usx", new XAttribute("version", "2.5"), Book(code), elems));

    public static XElement Book(string code, string? innerText = null) =>
        innerText == null
            ? new XElement("book", new XAttribute("code", code), new XAttribute("style", "id"))
            : new XElement("book", new XAttribute("code", code), new XAttribute("style", "id"), innerText);

    public static XElement Para(string style, params object[] contents)
    {
        var elem = new XElement("para", new XAttribute("style", style), contents);
        if (style == "")
            elem.Add(new XAttribute("status", "unknown"));
        return elem;
    }

    public static XElement Chapter(string number, string style = "c") =>
        new XElement("chapter", new XAttribute("number", number), new XAttribute("style", style));

    public static XElement Verse(string number, string style = "v") =>
        new XElement("verse", new XAttribute("number", number), new XAttribute("style", style));

    public static XElement Char(string style, params object[] contents) =>
        new XElement("char", new XAttribute("style", style), contents);

    public static XElement Ref(string loc, string text) => new XElement("ref", new XAttribute("loc", loc), text);

    public static XElement Note(string style, string caller, params object[] contents) =>
        new XElement("note", new XAttribute("style", style), new XAttribute("caller", caller), contents);

    public static XElement Figure(string file, string size, string reference, string text)
    {
        var elem = new XElement("figure", new XAttribute("style", "fig"));
        if (file != null)
            elem.Add(new XAttribute("file", file));
        if (size != null)
            elem.Add(new XAttribute("size", size));
        if (reference != null)
            elem.Add(new XAttribute("ref", reference));
        if (text != null)
            elem.Add(text);
        return elem;
    }

    public static XElement OptBreak() => new XElement("optbreak");

    public static XElement Milestone(string style) => new XElement("ms", new XAttribute("style", style));

    public static XElement Table(params object[] contents) => new XElement("table", contents);

    public static XElement Row(params object[] contents) =>
        new XElement("row", new XAttribute("style", "tr"), contents);

    public static XElement Cell(string style, string align, params object[] contents) =>
        new XElement("cell", new XAttribute("style", style), new XAttribute("align", align), contents);

    public static XElement Unmatched(string marker) => new XElement("unmatched", new XAttribute("marker", marker));
}
