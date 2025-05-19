using System.Text.RegularExpressions;
using Newtonsoft.Json;

namespace SIL.Converters.Usj.Tests;

/// <summary>
/// Test data for USJ and USX conversion.
/// </summary>
/// <remarks>
/// Converted to C# from:
/// <c>https://github.com/BiblioNexus-Foundation/scripture-editors/blob/main/packages/utilities/src/converters/usj/converter-test.data.ts</c>
/// </remarks>
public static partial class TestData
{
    private const string IDEOGRAPHIC_SPACE = "\u3000";
    private const string NBSP = "\u00A0";
    private const string THIN_SPACE = "\u2009";

    [GeneratedRegex(@"(?!>)[ \r\n\t]{2,}(?=<)", RegexOptions.Compiled)]
    private static partial Regex InterElementWhiteSpace();

    [GeneratedRegex(@"(?!>)[ \r\n\t]+(?=<\/usx>)", RegexOptions.Compiled)]
    private static partial Regex LastElementWhiteSpace();

    [GeneratedRegex(@" vid=""[A-Za-z0-9: ]+""", RegexOptions.Compiled)]
    private static partial Regex VidAttributes();

    [GeneratedRegex(@"<(verse|chapter) eid=""[A-Za-z0-9: ]+"" />", RegexOptions.Compiled)]
    private static partial Regex EidElements();

    public static string RemoveEidElements(string xml) => EidElements().Replace(xml, string.Empty);

    public static string RemoveVidAttributes(string xml) => VidAttributes().Replace(xml, string.Empty);

    public static string RemoveXmlWhiteSpace(string xml)
    {
        // C# adds whitespace to self-closing elements, so we do not remove it
        xml = InterElementWhiteSpace().Replace(xml, string.Empty);
        xml = LastElementWhiteSpace().Replace(xml, string.Empty);
        return xml.Trim();
    }

    /// <summary>
    /// Genesis 1:1 in USJ as a JSON string.
    /// </summary>
    public static readonly string JsonGen1V1 = $$"""
        {
          type: "{{Usj.UsjType}}",
          version: "{{Usj.UsjVersion}}",
          content: [
            { type: "book", marker: "id", code: "GEN", content: ["Some Scripture Version"] },
            { type: "chapter", marker: "c", number: "1", sid: "GEN 1", pubnumber: "I" },
            {
              type: "para",
              marker: "p",
              content: [
                { type: "verse", marker: "v", number: "1", sid: "GEN 1:1" },
                "the first verse ",
                { type: "verse", marker: "v", number: "2", sid: "GEN 1:2" },
                "the second verse ",
                { type: "verse", marker: "v", number: "15", altnumber: "3", sid: "GEN 1:15" },
                "Tell the Israelites that I, the ",
                { type: "char", marker: "nd", content: ["Lord"] },
                " ",
                { type: "char", marker: "nd", content: ["God"] },
                ", the God of their ancestors, the God of Abraham, Isaac, and Jacob,",
                { type: "char", marker: "va", content: ["4"] },
              ],
            },
            { type: "para", marker: "b" },
            {
              type: "para",
              marker: "q2",
              content: [
                { type: "verse", marker: "v", number: "16", sid: "GEN 1:16" },
                "“There is no help for him in God.”",
                {
                  type: "note",
                  marker: "f",
                  caller: "+",
                  category: "TN",
                  content: [
                    { type: "char", marker: "fr", content: ["3:2 "] },
                    {
                      type: "char",
                      marker: "ft",
                      content: ["The Hebrew word rendered “God” is “אֱלֹהִ֑ים” (Elohim)."],
                    },
                  ],
                },
                " ",
                { type: "unmatched", marker: "f*" },
                " ",
                { type: "char", marker: "qs", content: ["Selah."] },
              ],
            },
          ],
        }
        """;

    /// <summary>
    /// An empty USX document.
    /// </summary>
    public static readonly string UsxEmpty = $"""<usx version="{Usx.UsxVersion}" />""";

    /// <summary>
    /// An empty USJ object.
    /// </summary>
    public static readonly Usj UsjEmpty = JsonConvert.DeserializeObject<Usj>(
        $$"""{ type: "{{Usj.UsjType}}", version: "{{Usj.UsjVersion}}", content: [] }"""
    )!;

    /// <summary>
    /// Genesis 1:1 in USX (with other test data).
    /// </summary>
    /// <remarks>
    /// Reformatted from:
    /// <c>https://github.com/mvh-solutions/nice-usfm-json/blob/main/samples/character/origin.xml</c>
    /// Additional test features:
    ///  - Whitespace for all self-closing element endings.
    ///  - Reorder attributes to match UsxUsfmParserSink output.
    /// </remarks>
    public static readonly string UsxGen1V1 = $"""
        <usx version="{Usx.UsxVersion}">
          <book code="GEN" style="id">Some Scripture Version</book>
          <chapter number="1" style="c" pubnumber="I" sid="GEN 1" />
          <para style="p">
            <verse number="1" style="v" sid="GEN 1:1" />the first verse <verse eid="GEN 1:1" />
            <verse number="2" style="v" sid="GEN 1:2" />the second verse <verse eid="GEN 1:2" />
            <verse number="15" style="v" altnumber="3" sid="GEN 1:15" />Tell the Israelites that I, the <char style="nd">Lord</char> <char style="nd">God</char>, the God of their ancestors, the God of Abraham, Isaac, and Jacob,<char style="va">4</char><verse eid="GEN 1:15" />
          </para>
          <para style="b" />
          <para style="q2"><verse number="16" style="v" sid="GEN 1:16" />“There is no help for him in God.”<note caller="+" style="f" category="TN"><char style="fr">3:2 </char><char style="ft">The Hebrew word rendered “God” is “אֱלֹהִ֑ים” (Elohim).</char></note> <unmatched marker="f*" /> <char style="qs">Selah.</char><verse eid="GEN 1:16" /></para>
          <chapter eid="GEN 1" />
        </usx>
        """;

    /// <summary>
    /// Genesis 1:1 in USJ (with other test data).
    /// </summary>
    /// <remarks>
    /// Modified from:
    /// <c>https://github.com/mvh-solutions/nice-usfm-json/blob/main/samples/character/proposed.json</c>
    /// Additional test features:
    ///  - Preserve significant whitespace at the beginning or end of text
    ///  - Preserve significant whitespace between elements
    ///  - Reorder attributes to match UsxUsfmParserSink output.
    /// </remarks>
    public static readonly Usj UsjGen1V1 = JsonConvert.DeserializeObject<Usj>(JsonGen1V1)!;

    /// <summary>
    /// Tests a chapter with an implied paragraph.
    /// </summary>
    /// <remarks>Attributes are reordered to match UsxUsfmParserSink output.</remarks>
    public static readonly string UsxGen1V1ImpliedPara = $"""
        <usx version="{Usx.UsxVersion}">
          <book code="GEN" style="id" />
          <chapter number="1" style="c" sid="GEN 1" />
          <verse number="1" style="v" sid="GEN 1:1" />the first verse <verse eid="GEN 1:1" />
          <verse number="2" style="v" sid="GEN 1:2" />the second verse <verse eid="GEN 1:2" />
          <verse number="15" style="v" sid="GEN 1:15" />Tell the Israelites that I, the <char style="nd">Lord</char>, the God of their ancestors, the God of Abraham, Isaac, and Jacob,<verse eid="GEN 1:15" />
          <chapter eid="GEN 1" />
        </usx>
        """;

    public static readonly Usj UsjGen1V1ImpliedPara = JsonConvert.DeserializeObject<Usj>(
        $$"""
        {
          type: "{{Usj.UsjType}}",
          version: "{{Usj.UsjVersion}}",
          content: [
            { type: "book", marker: "id", code: "GEN" },
            { type: "chapter", marker: "c", number: "1", sid: "GEN 1" },
            { type: "verse", marker: "v", number: "1", sid: "GEN 1:1" },
            "the first verse ",
            { type: "verse", marker: "v", number: "2", sid: "GEN 1:2" },
            "the second verse ",
            { type: "verse", marker: "v", number: "15", sid: "GEN 1:15" },
            "Tell the Israelites that I, the ",
            { type: "char", marker: "nd", content: ["Lord"] },
            ", the God of their ancestors, the God of Abraham, Isaac, and Jacob,",
          ],
        }
        """
    )!;

    /// <summary>
    /// Includes various nonstandard features we want to support in the
    /// spirit of generously supporting user data.
    ///
    /// Additional test features:
    ///  - Preserve contents of `ca` even though it seems possible `ca` should not occur as its own marker
    ///  - Preserve non-standard contents of `b` marker that should not have contents
    ///  - Preserve closed attribute on character marker. This is non-standard use of a non-standard marker.
    ///  - Reorder attributes to match UsxUsfmParserSink output.
    /// </summary>
    public static readonly string UsxGen1V1Nonstandard = $"""
        <usx version="{Usx.UsxVersion}">
          <book code="GEN" style="id">Some Scripture Version</book>
          <chapter number="1" style="c" sid="GEN 1" />
          <para style="p">
            <verse number="1" style="v" sid="GEN 1:1" />the <char style="nd" closed="false">first verse <verse eid="GEN 1:1" />
            <verse number="2" style="v" sid="GEN 1:2" />the second verse <char style="ca">4</char></char><verse eid="GEN 1:2" />
          </para>
          <para style="b">This should not be here</para>
          <chapter eid="GEN 1" />
        </usx>
        """;

    public static readonly Usj UsjGen1V1Nonstandard = JsonConvert.DeserializeObject<Usj>(
        $$"""
        {
          type: "{{Usj.UsjType}}",
          version: "{{Usj.UsjVersion}}",
          content: [
            { type: "book", marker: "id", code: "GEN", content: ["Some Scripture Version"] },
            { type: "chapter", marker: "c", number: "1", sid: "GEN 1" },
            {
              type: "para",
              marker: "p",
              content: [
                { type: "verse", marker: "v", number: "1", sid: "GEN 1:1" },
                "the ",
                {
                  type: "char",
                  marker: "nd",
                  closed: "false",
                  content: [
                    "first verse ",
                    { type: "verse", marker: "v", number: "2", sid: "GEN 1:2" },
                    "the second verse ",
                    { type: "char", marker: "ca", content: ["4"] },
                  ],
                },
              ],
            },
            { type: "para", marker: "b", content: ["This should not be here"] },
          ],
        }
        """
    )!;

    /// <summary>
    /// Tests removing structural whitespace (see https://docs.usfm.bible/usfm/latest/whitespace.html) in
    /// USX while preserving content whitespace.
    ///
    /// Includes various strange whitespace quirks that Paratext supports.
    ///
    /// For example, Paratext's UsfmToken.RegularizeSpaces does not deduplicate U+3000 (IDEOGRAPHIC SPACE)
    /// after other whitespace and does not deduplicate other whitespace after U+3000 (IDEOGRAPHIC SPACE).
    /// However, it does deduplicate multiple U+3000 (IDEOGRAPHIC SPACE) in a row.
    ///
    /// TODO: Also test ZWSP and its quirks.
    /// TODO: Especially concerning is that the editor inserts a bunch of ZWSP in many places in the editable state.
    /// </summary>
    /// <remarks>Attributes are reordered to match UsxUsfmParserSink output.</remarks>
    public static readonly string UsxGen1V1Whitespace = $"""
        <usx version="{Usx.UsxVersion}">
          <book code="GEN" style="id" />
          <chapter number="1" style="c" sid="GEN 1" />
          <verse number="1" style="v" sid="GEN 1:1" /><char style="nd">space</char> <char style="wj">between</char> <char style="nd">each</char>{IDEOGRAPHIC_SPACE}<char style="wj">word</char> <char style="nd">should</char>{THIN_SPACE}{IDEOGRAPHIC_SPACE} <char style="wj">stay</char><verse eid="GEN 1:1" />
          <chapter eid="GEN 1" />
        </usx>
        """;

    public static readonly Usj UsjGen1V1Whitespace = JsonConvert.DeserializeObject<Usj>(
        $$"""
        {
          type: "{{Usj.UsjType}}",
          version: "{{Usj.UsjVersion}}",
          content: [
            { type: "book", marker: "id", code: "GEN" },
            { type: "chapter", marker: "c", number: "1", sid: "GEN 1" },
            { type: "verse", marker: "v", number: "1", sid: "GEN 1:1" },
            { type: "char", marker: "nd", content: ["space"] },
            " ",
            { type: "char", marker: "wj", content: ["between"] },
            " ",
            { type: "char", marker: "nd", content: ["each"] },
            "{{IDEOGRAPHIC_SPACE}}",
            { type: "char", marker: "wj", content: ["word"] },
            " ",
            { type: "char", marker: "nd", content: ["should"] },
            "{{THIN_SPACE}}{{IDEOGRAPHIC_SPACE}} ",
            { type: "char", marker: "wj", content: ["stay"] },
          ],
        }
        """
    )!;

    /// <summary>
    /// Genesis 1:1 in USX (with attributes to remove).
    /// </summary>
    /// <remarks>
    /// This is a version of <see cref="UsxGen1V1"/> with attributes that will be removed.
    /// If round-tripping, compare the final USX to <see cref="UsxGen1V1"/>.
    /// </remarks>
    public static readonly string UsxGen1V1WithAttributesToRemove = $"""
        <usx version="{Usx.UsxVersion}">
          <book code="GEN" style="id">Some Scripture Version</book>
          <chapter number="1" style="c" pubnumber="I" sid="GEN 1" />
          <para style="p" vid="GEN 1:1-3" status="not standard">
            <verse number="1" style="v" sid="GEN 1:1" />the first verse <verse eid="GEN 1:1" />
            <verse number="2" style="v" sid="GEN 1:2" />the second verse <verse eid="GEN 1:2" />
            <verse number="15" style="v" altnumber="3" sid="GEN 1:15" />Tell the Israelites that I, the <char style="nd">Lord</char> <char style="nd">God</char>, the God of their ancestors, the God of Abraham, Isaac, and Jacob,<char style="va">4</char><verse eid="GEN 1:15" />
          </para>
          <para style="b" />
          <para style="q2"><verse number="16" style="v" sid="GEN 1:16" />“There is no help for him in God.”<note caller="+" style="f" category="TN"><char style="fr">3:2 </char><char style="ft">The Hebrew word rendered “God” is “אֱלֹהִ֑ים” (Elohim).</char></note> <unmatched marker="f*" /> <char style="qs">Selah.</char><verse eid="GEN 1:16" /></para>
          <chapter eid="GEN 1" />
        </usx>
        """;

    /// <summary>
    /// Genesis 1:1 in USX (with a table).
    /// </summary>
    public static readonly string UsxGen1V1WithTable = $"""
        <usx version="{Usx.UsxVersion}">
          <book code="GEN" style="id">Some Scripture Version</book>
          <chapter number="1" style="c" sid="GEN 1" />
          <table>
            <row style="tr">
              <cell style="th1" align="start">Tribe </cell>
              <cell style="th2" align="start">Leader </cell>
              <cell style="th3" align="start">Number </cell>
            </row>
          </table>
          <para style="p">
            <verse number="1" style="v" sid="GEN 1:1" />the first verse <verse eid="GEN 1:1" />
          </para>
          <chapter eid="GEN 1" />
        </usx>
        """;

    /// <summary>
    /// Genesis 1:1 in USJ (with a table).
    /// </summary>
    public static readonly Usj UsjGen1V1WithTable = JsonConvert.DeserializeObject<Usj>(
        $$"""
        {
          type: "{{Usj.UsjType}}",
          version: "{{Usj.UsjVersion}}",
          content: [
            { type: "book", marker: "id", code: "GEN", content: ["Some Scripture Version"] },
            { type: "chapter", marker: "c", number: "1", sid: "GEN 1" },
            {
              type: "table",
              content: [
                {
                  type: "table:row",
                  marker: "tr",
                  content: [
                    { type: "table:cell", marker: "th1", align: "start", content: ["Tribe "] },
                    { type: "table:cell", marker: "th2", align: "start", content: ["Leader "] },
                    { type: "table:cell", marker: "th3", align: "start", content: ["Number "] },
                  ],
                },
              ],
            },
            {
              type: "para",
              marker: "p",
              content: [
                { type: "verse", marker: "v", number: "1", sid: "GEN 1:1" },
                "the first verse ",
              ],
            },
          ],
        }
        """
    )!;

    /// <summary>
    /// Genesis 1:1 in USJ (with additional blank chapters).
    /// </summary>
    public static readonly Usj UsjGen1V1WithBlankChapters = JsonConvert.DeserializeObject<Usj>(
        $$"""
        {
          type: "{{Usj.UsjType}}",
          version: "{{Usj.UsjVersion}}",
          content: [
            { type: "book", marker: "id", code: "GEN" },
            { type: "chapter", marker: "c", number: "1", sid: "GEN 1" },
            { type: "verse", marker: "v", number: "1", sid: "GEN 1:1" },
            "In the beginning ",
            { type: "verse", marker: "v", number: "2", sid: "GEN 1:2" },
            { type: "chapter", marker: "c", number: "2", sid: "GEN 2" },
            { type: "chapter", marker: "c", number: "3", sid: "GEN 3" },
          ],
        }
        """
    )!;

    /// <summary>
    /// Genesis 1:1 in USX (with additional blank chapters).
    /// </summary>
    public static readonly string UsxGen1V1WithBlankChapters = $"""
        <usx version="{Usx.UsxVersion}">
          <book code="GEN" style="id" />
          <chapter number="1" style="c" sid="GEN 1" />
          <verse number="1" style="v" sid="GEN 1:1" />In the beginning <verse eid="GEN 1:1" />
          <verse number="2" style="v" sid="GEN 1:2" /><verse eid="GEN 1:2" /><chapter eid="GEN 1" />
          <chapter number="2" style="c" sid="GEN 2" /><chapter eid="GEN 2" />
          <chapter number="3" style="c" sid="GEN 3" /><chapter eid="GEN 3" />
        </usx>
        """;

    /// <summary>
    /// Genesis 1:1 in USJ (with blank verses).
    /// </summary>
    public static readonly Usj UsjGen1V1WithBlankVerses = JsonConvert.DeserializeObject<Usj>(
        $$"""
        {
          type: "{{Usj.UsjType}}",
          version: "{{Usj.UsjVersion}}",
          content: [
            { type: "book", marker: "id", code: "GEN" },
            { type: "chapter", marker: "c", number: "1", sid: "GEN 1" },
            { type: "verse", marker: "v", number: "1", sid: "GEN 1:1" },
            "In the beginning ",
            { type: "verse", marker: "v", number: "2", sid: "GEN 1:2" },
            { type: "verse", marker: "v", number: "3", sid: "GEN 1:3" },
            { type: "verse", marker: "v", number: "4", sid: "GEN 1:4" },
          ],
        }
        """
    )!;

    /// <summary>
    /// Genesis 1:1 in USX (with blank verses).
    /// </summary>
    public static readonly string UsxGen1V1WithBlankVerses = $"""
        <usx version="{Usx.UsxVersion}">
          <book code="GEN" style="id" />
          <chapter number="1" style="c" sid="GEN 1" />
          <verse number="1" style="v" sid="GEN 1:1" />In the beginning <verse eid="GEN 1:1" />
          <verse number="2" style="v" sid="GEN 1:2" /><verse eid="GEN 1:2" />
          <verse number="3" style="v" sid="GEN 1:3" /><verse eid="GEN 1:3" />
          <verse number="4" style="v" sid="GEN 1:4" /><verse eid="GEN 1:4" />
          <chapter eid="GEN 1" />
        </usx>
        """;

    /// <summary>
    /// Genesis 1:1 in USJ (with no sids).
    /// </summary>
    public static readonly Usj UsjGen1V1WithNoSids = JsonConvert.DeserializeObject<Usj>(
        $$"""
        {
          type: "{{Usj.UsjType}}",
          version: "{{Usj.UsjVersion}}",
          content: [
            { type: "book", marker: "id", code: "GEN" },
            { type: "chapter", marker: "c", number: "1"},
            { type: "verse", marker: "v", number: "1" },
            "In the beginning ",
            { type: "verse", marker: "v", number: "2" },
            { type: "verse", marker: "v", number: "3" },
            { type: "verse", marker: "v", number: "4" },
          ],
        }
        """
    )!;

    /// <summary>
    /// Genesis 1:1 in USX (with no sids).
    /// </summary>
    public static readonly string UsxGen1V1WithNoSids = $"""
        <usx version="{Usx.UsxVersion}">
          <book code="GEN" style="id" />
          <chapter number="1" style="c" />
          <verse number="1" style="v" />In the beginning <verse number="2" style="v" />
          <verse number="3" style="v" />
          <verse number="4" style="v" />
        </usx>
        """;

    /// <summary>
    /// Tests handling of non-breaking spaces, which .Net recognizes as whitespace, but XML does not.
    /// </summary
    public static readonly string UsxGen1V1Nbsp = $"""
        <usx version="{Usx.UsxVersion}">
          <book code="GEN" style="id" />
          <chapter number="1" style="c" sid="GEN 1" />
          <verse number="1" style="v" sid="GEN 1:1" /><char style="nd">{NBSP}</char>{NBSP}<char style="wj">{NBSP}</char><verse eid="GEN 1:1" />
          <chapter eid="GEN 1" />
        </usx>
        """;

    public static readonly Usj UsjGen1V1Nbsp = JsonConvert.DeserializeObject<Usj>(
        $$"""
        {
          type: "{{Usj.UsjType}}",
          version: "{{Usj.UsjVersion}}",
          content: [
            { type: "book", marker: "id", code: "GEN" },
            { type: "chapter", marker: "c", number: "1", sid: "GEN 1" },
            { type: "verse", marker: "v", number: "1", sid: "GEN 1:1" },
            { type: "char", marker: "nd", content: ["{{NBSP}}"] },
            "{{NBSP}}",
            { type: "char", marker: "wj", content: ["{{NBSP}}"] },
          ],
        }
        """
    )!;

    /// <summary>
    /// Mark 1:1 in USX (with poetic formatting).
    /// </summary>
    public static readonly string UsxMrk1V1WithPoeticFormatting = $"""
        <usx version="{Usx.UsxVersion}">
          <book code="MRK" style="id" />
          <para style="toc1">Mark</para>
          <para style="toc2">Mark</para>
          <para style="mt1">The Gospel according to St. Mark</para>
          <chapter number="1" style="c" sid="MRK 1" />
          <para style="s1">The office of John the Baptist</para>
          <para style="m">
            <verse number="1" style="v" sid="MRK 1:1" />The beginning of the gospel of Jesus Christ, the Son of God; <verse eid="MRK 1:1" />
            <verse number="2" style="v" sid="MRK 1:2" />As it is written in the prophets,</para>
          <para style="b" vid="MRK 1:2" />
          <para style="q1" vid="MRK 1:2">“Behold, I send my messenger before thy face,</para>
          <para style="q2" vid="MRK 1:2">which shall prepare thy way before thee. <verse eid="MRK 1:2" /></para>
          <para style="q1">
            <verse number="3" style="v" sid="MRK 1:3" />The voice of one crying in the wilderness,</para>
          <para style="q1" vid="MRK 1:3">‘Prepare ye the way of the <char style="nd">Lord</char>,</para>
          <para style="q2" vid="MRK 1:3">make his paths straight.’”<verse eid="MRK 1:3" /></para>
          <para style="b" />
          <chapter eid="MRK 1" />
        </usx>
        """;

    /// <summary>
    /// Mark 1:1 in USX (with a single space in the note that should be preserved).
    /// </summary>
    public static readonly string UsxMrk1V1WithSingleSpace = $"""
        <usx version="{Usx.UsxVersion}">
          <book code="MRK" style="id" />
          <chapter number="1" style="c" sid="MRK 1" />
          <verse number="1" style="v" />In the
          <note caller="+" style="f" category="dup"> <char style="fr" closed="false">1.1 </char>
          <char style="ft" closed="false"><char style="xt" closed="false">See 2<char style="xt" closed="false" />
          </char></char></note> beginning
          <chapter eid="MRK 1" />
        </usx>
        """;
}
