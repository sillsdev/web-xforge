using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using SIL.Machine.Corpora;
using SIL.Machine.Tokenization;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

public class SFBiblicalTermsText : IText
{
    private static readonly Regex BracketedTextRegex = new Regex(@"\([^)]*\)", RegexOptions.Compiled);
    private static readonly Regex WhitespaceRegex = new Regex(@"\s+", RegexOptions.Compiled);
    private readonly IEnumerable<TextSegment> _segments;

    public SFBiblicalTermsText(
        ITokenizer<string, int, string> wordTokenizer,
        string projectId,
        IList<BiblicalTerm> biblicalTerms
    )
    {
        Id = $"{projectId}_biblical_terms";

        _segments = GetSegments(wordTokenizer, biblicalTerms).OrderBy(s => s.SegmentRef).ToArray();
    }

    public SFBiblicalTermsText(
        ITokenizer<string, int, string> wordTokenizer,
        string projectId,
        XDocument termRenderingsDoc
    )
    {
        Id = $"{projectId}_biblical_terms";

        _segments = GetSegments(wordTokenizer, termRenderingsDoc).OrderBy(s => s.SegmentRef).ToArray();
    }

    public string Id { get; }

    public string SortKey => Id;

    public IEnumerable<TextSegment> GetSegments(bool includeText = true, IText? basedOn = null) => _segments;

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

    private IEnumerable<TextSegment> GetSegments(
        ITokenizer<string, int, string> wordTokenizer,
        IList<BiblicalTerm> biblicalTerms
    )
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

                // Get the words in the rendering
                string[] segment = wordTokenizer.Tokenize(rendering).ToArray();

                // Sentence placement is not essential for biblical terms. Set all to false
                yield return new TextSegment(
                    Id,
                    new TextSegmentRef(biblicalTerm.TermId),
                    segment,
                    false,
                    false,
                    false,
                    segment.Length == 0
                );
            }
        }
    }

    private IEnumerable<TextSegment> GetSegments(
        ITokenizer<string, int, string> wordTokenizer,
        XDocument termRenderingsDoc
    )
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
            string[] renderings =
                renderingsStr?.Trim().Split("||", StringSplitOptions.RemoveEmptyEntries) ?? Array.Empty<string>();

            foreach (string rendering in renderings.Select(RemoveParatextSyntaxFromRendering))
            {
                // Do not add blank renderings
                if (string.IsNullOrWhiteSpace(rendering))
                {
                    continue;
                }

                // Get the words in the rendering
                string[] segment = wordTokenizer.Tokenize(rendering).ToArray();

                // Sentence placement is not essential for biblical terms. Set all to false
                yield return new TextSegment(
                    Id,
                    new TextSegmentRef(id),
                    segment,
                    false,
                    false,
                    false,
                    segment.Length == 0
                );
            }
        }
    }
}
