using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

public class SFBiblicalTermsText : ISFText
{
    private static readonly Regex BracketedTextRegex = new Regex(@"\([^)]*\)", RegexOptions.Compiled);
    private static readonly Regex WhitespaceRegex = new Regex(@"\s+", RegexOptions.Compiled);

    public SFBiblicalTermsText(string projectId, IList<BiblicalTerm> biblicalTerms)
    {
        Id = $"{projectId}_biblical_terms";
        Segments = GetSegments(biblicalTerms).OrderBy(s => s.SegmentRef).ToArray();
    }

    public SFBiblicalTermsText(string projectId, XDocument termRenderingsDoc)
    {
        Id = $"{projectId}_biblical_terms";
        Segments = GetSegments(termRenderingsDoc).OrderBy(s => s.SegmentRef).ToArray();
    }

    public string Id { get; }

    public IEnumerable<SFTextSegment> Segments { get; }

    /// <summary>
    /// Removes Paratext specific codes from the Biblical Term Rendering.
    /// </summary>
    /// <param name="rendering">The BT rendering.</param>
    /// <returns>The cleaned rendering.</returns>
    /// <remarks>
    /// This method removes text in brackets, asterisks, forward slashes, and normalizes the whitespace.
    /// See the Guide in the Edit Biblical Term Rendering dialog in Paratext for details on these codes.
    /// </remarks>
    private static string RemoveParatextSyntaxFromRendering(string rendering)
    {
        rendering = rendering.Replace("*", string.Empty);
        rendering = BracketedTextRegex.Replace(rendering, string.Empty);
        rendering = rendering.Replace("/", " ");
        rendering = WhitespaceRegex.Replace(rendering, " ");
        return rendering.Trim();
    }

    private static IEnumerable<SFTextSegment> GetSegments(IList<BiblicalTerm> biblicalTerms)
    {
        if (!biblicalTerms.Any())
        {
            yield break;
        }

        foreach (BiblicalTerm biblicalTerm in biblicalTerms.OrderBy(t => t.TermId))
        {
            foreach (string rendering in biblicalTerm.Renderings.Select(RemoveParatextSyntaxFromRendering))
            {
                // Do not add blank renderings
                if (string.IsNullOrWhiteSpace(rendering))
                {
                    continue;
                }

                // Sentence placement is not essential for biblical terms. Set all to false
                yield return new SFTextSegment([biblicalTerm.TermId], rendering, false, false, false);
            }
        }
    }

    private static IEnumerable<SFTextSegment> GetSegments(XDocument termRenderingsDoc)
    {
        if (termRenderingsDoc.Root is null)
        {
            yield break;
        }

        foreach (
            XElement termRenderingElem in termRenderingsDoc
                .Root.Elements("TermRendering")
                .Where(t => !(bool)t.Attribute("Guess"))
                .OrderBy(t => t.Attribute("Id")?.Value)
        )
        {
            string id = termRenderingElem.Attribute("Id")?.Value;
            if (string.IsNullOrWhiteSpace(id))
            {
                continue;
            }

            var renderingsStr = (string?)termRenderingElem.Element("Renderings");
            string[] renderings = renderingsStr?.Trim().Split("||", StringSplitOptions.RemoveEmptyEntries) ?? [];

            foreach (string rendering in renderings.Select(RemoveParatextSyntaxFromRendering))
            {
                // Do not add blank renderings
                if (string.IsNullOrWhiteSpace(rendering))
                {
                    continue;
                }

                // Sentence placement is not essential for biblical terms. Set all to false
                yield return new SFTextSegment([id], rendering, false, false, false);
            }
        }
    }
}
