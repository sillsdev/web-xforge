using System.Linq;
using System.Xml.Linq;
using NUnit.Framework;
using SIL.Machine.Corpora;
using SIL.Machine.Tokenization;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class SFBiblicalTermsTextTests
{
    [Test]
    public void Segments_EmptyDoc()
    {
        var tokenizer = new LatinWordTokenizer();
        var doc = new XDocument(new XElement("TermRenderingsList"));
        var text = new SFBiblicalTermsText(tokenizer, "project01", doc);
        Assert.That(text.GetSegments(), Is.Empty);
    }

    [Test]
    public void Segments_EmptyRenderings()
    {
        var tokenizer = new LatinWordTokenizer();
        var doc = new XDocument(
            new XElement(
                "TermRenderingsList",
                TermRendering("term1", guess: false),
                TermRendering("term2", guess: false)
            )
        );
        var text = new SFBiblicalTermsText(tokenizer, "project01", doc);
        Assert.That(text.GetSegments(), Is.Empty);
    }

    [Test]
    public void Segments_Guess()
    {
        var tokenizer = new LatinWordTokenizer();
        var doc = new XDocument(
            new XElement(
                "TermRenderingsList",
                TermRendering("term1", guess: true, "Term1"),
                TermRendering("term2", guess: true, "Term2")
            )
        );
        var text = new SFBiblicalTermsText(tokenizer, "project01", doc);
        Assert.That(text.GetSegments(), Is.Empty);
    }

    [Test]
    public void Segments_Renderings()
    {
        var tokenizer = new LatinWordTokenizer();
        var doc = new XDocument(
            new XElement(
                "TermRenderingsList",
                TermRendering("term2", guess: false, "Term2"),
                TermRendering("term1", guess: false, "Term1")
            )
        );
        var text = new SFBiblicalTermsText(tokenizer, "project01", doc);
        TextSegment[] segments = text.GetSegments().ToArray();
        Assert.That(segments.Length, Is.EqualTo(2));
        Assert.That(segments[0].SegmentRef.ToString(), Is.EqualTo("term1"));
        Assert.That(string.Join(" ", segments[0].Segment), Is.EqualTo("Term1"));
        Assert.That(string.Join(" ", segments[1].Segment), Is.EqualTo("Term2"));
    }

    [Test]
    public void Segments_MultipleRenderings()
    {
        var tokenizer = new LatinWordTokenizer();
        var doc = new XDocument(
            new XElement(
                "TermRenderingsList",
                TermRendering("term2", guess: false, "Term2-1", "Term2-2"),
                TermRendering("term1", guess: false, "Term1")
            )
        );
        var text = new SFBiblicalTermsText(tokenizer, "project01", doc);
        TextSegment[] segments = text.GetSegments().ToArray();
        Assert.That(segments.Length, Is.EqualTo(3));
        Assert.That(string.Join(" ", segments[0].Segment), Is.EqualTo("Term1"));
        Assert.That(segments[1].SegmentRef.ToString(), Is.EqualTo("term2"));
        Assert.That(string.Join(" ", segments[1].Segment), Is.EqualTo("Term2-1"));
        Assert.That(segments[2].SegmentRef.ToString(), Is.EqualTo("term2"));
        Assert.That(string.Join(" ", segments[2].Segment), Is.EqualTo("Term2-2"));
    }

    private static XElement TermRendering(string id, bool guess, params string[] renderings) =>
        new XElement(
            "TermRendering",
            new XAttribute("Id", id),
            new XAttribute("Guess", guess),
            new XElement(
                "Renderings",
                string.Join("||", renderings),
                new XElement("Glossary"),
                new XElement("Changes"),
                new XElement("Notes"),
                new XElement("Denials")
            )
        );
}
