using System;
using System.Collections.Generic;
using System.Linq;
using System.Xml.Linq;
using NUnit.Framework;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class SFBiblicalTermsTextTests
{
    [Test]
    public void Segments_EmptyDoc()
    {
        var doc = new XDocument(new XElement("TermRenderingsList"));
        var text = new SFBiblicalTermsText("project01", doc);
        Assert.That(text.Segments, Is.Empty);
    }

    [Test]
    public void Segments_EmptyRenderings()
    {
        var doc = new XDocument(
            new XElement(
                "TermRenderingsList",
                TermRendering("term1", guess: false),
                TermRendering("term2", guess: false)
            )
        );
        var text = new SFBiblicalTermsText("project01", doc);
        Assert.That(text.Segments, Is.Empty);
    }

    [Test]
    public void Segments_Guess()
    {
        var doc = new XDocument(
            new XElement(
                "TermRenderingsList",
                TermRendering("term1", guess: true, "Term1"),
                TermRendering("term2", guess: true, "Term2")
            )
        );
        var text = new SFBiblicalTermsText("project01", doc);
        Assert.That(text.Segments, Is.Empty);
    }

    [Test]
    public void Segments_InvalidDocument()
    {
        var doc = new XDocument();
        var text = new SFBiblicalTermsText("project01", doc);
        Assert.That(text.Segments, Is.Empty);
    }

    [Test]
    public void Segments_InvalidId()
    {
        var doc = new XDocument(new XElement("TermRenderingsList", TermRendering(string.Empty, guess: false, "Term1")));
        var text = new SFBiblicalTermsText("project01", doc);
        Assert.That(text.Segments, Is.Empty);
    }

    [Test]
    public void Segments_Renderings()
    {
        var doc = new XDocument(
            new XElement(
                "TermRenderingsList",
                TermRendering("term2", guess: false, "Term2"),
                TermRendering("term1", guess: false, "Term1")
            )
        );
        var text = new SFBiblicalTermsText("project01", doc);
        SFTextSegment[] segments = text.Segments.ToArray();
        Assert.That(segments.Length, Is.EqualTo(2));

        Assert.That(segments[0].SegmentRef.ToString(), Is.EqualTo("term1"));
        Assert.That(segments[0].SegmentText, Is.EqualTo("Term1"));

        Assert.That(segments[1].SegmentRef.ToString(), Is.EqualTo("term2"));
        Assert.That(segments[1].SegmentText, Is.EqualTo("Term2"));
    }

    [Test]
    public void Segments_MultipleRenderings()
    {
        var doc = new XDocument(
            new XElement(
                "TermRenderingsList",
                TermRendering("term2", guess: false, "Term2-1", "Term2-2"),
                TermRendering("term1", guess: false, "Term1", "\n", " ")
            )
        );
        var text = new SFBiblicalTermsText("project01", doc);
        SFTextSegment[] segments = text.Segments.ToArray();
        Assert.That(segments.Length, Is.EqualTo(3));

        Assert.That(segments[0].SegmentRef.ToString(), Is.EqualTo("term1"));
        Assert.That(segments[0].SegmentText, Is.EqualTo("Term1"));

        Assert.That(segments[1].SegmentRef.ToString(), Is.EqualTo("term2"));
        Assert.That(segments[1].SegmentText, Is.EqualTo("Term2-1"));

        Assert.That(segments[2].SegmentRef.ToString(), Is.EqualTo("term2"));
        Assert.That(segments[2].SegmentText, Is.EqualTo("Term2-2"));
    }

    [Test]
    public void Segments_ComplexRenderings()
    {
        // These examples are drawn from the Paratext in-app documentation
        var renderings = new List<(string rendering, string expected)>
        {
            ("word1", "word1"),
            ("word1 word2", "word1 word2"),
            ("word1/word2", "word1 word2"),
            ("word1 / word2", "word1 word2"),
            ("word1 * word2", "word1 word2"),
            ("word1 ** word2", "word1 word2"),
            ("word1 * * word2", "word1 word2"),
            ("word1*", "word1"),
            ("*word1", "word1"),
            ("*word1*", "word1"),
            ("w*rd1", "wrd1"),
            ("word1 (information)", "word1"),
        };

        var doc = new XDocument(
            new XElement(
                "TermRenderingsList",
                TermRendering("Term01", guess: false, renderings[0].rendering),
                TermRendering("Term02", guess: false, renderings[1].rendering),
                TermRendering("Term03", guess: false, renderings[2].rendering),
                TermRendering("Term04", guess: false, renderings[3].rendering),
                TermRendering("Term05", guess: false, renderings[4].rendering),
                TermRendering("Term06", guess: false, renderings[5].rendering),
                TermRendering("Term07", guess: false, renderings[6].rendering),
                TermRendering("Term08", guess: false, renderings[7].rendering),
                TermRendering("Term09", guess: false, renderings[8].rendering),
                TermRendering("Term10", guess: false, renderings[9].rendering),
                TermRendering("Term11", guess: false, renderings[10].rendering),
                TermRendering("Term12", guess: false, renderings[11].rendering)
            )
        );
        var text = new SFBiblicalTermsText("project01", doc);
        SFTextSegment[] segments = text.Segments.ToArray();
        Assert.That(segments.Length, Is.EqualTo(renderings.Count));
        for (int i = 0; i < renderings.Count; i++)
        {
            Assert.That(segments[i].SegmentRef.ToString(), Is.EqualTo("Term" + (i + 1).ToString("D2")));
            Assert.That(segments[i].SegmentText, Is.EqualTo(renderings[i].expected));
        }
    }

    [Test]
    public void Segments_BiblicalTermsFromMongo()
    {
        var biblicalTerms = new List<BiblicalTerm>
        {
            new BiblicalTerm { TermId = "term2", Renderings = { "Term2-1", "Term2-2" } },
            new BiblicalTerm { TermId = "term1", Renderings = { "Term1", "\n" } },
        };
        var text = new SFBiblicalTermsText("project01", biblicalTerms);
        SFTextSegment[] segments = text.Segments.ToArray();
        Assert.That(segments.Length, Is.EqualTo(3));

        Assert.That(segments[0].SegmentRef.ToString(), Is.EqualTo("term1"));
        Assert.That(segments[0].SegmentText, Is.EqualTo("Term1"));

        Assert.That(segments[1].SegmentRef.ToString(), Is.EqualTo("term2"));
        Assert.That(segments[1].SegmentText, Is.EqualTo("Term2-1"));

        Assert.That(segments[2].SegmentRef.ToString(), Is.EqualTo("term2"));
        Assert.That(segments[2].SegmentText, Is.EqualTo("Term2-2"));
    }

    [Test]
    public void Segments_NoBiblicalTerms()
    {
        var biblicalTerms = Array.Empty<BiblicalTerm>();
        var text = new SFBiblicalTermsText("project01", biblicalTerms);
        Assert.That(text.Segments, Is.Empty);
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
