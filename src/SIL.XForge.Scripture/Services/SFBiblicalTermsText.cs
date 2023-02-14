using System;
using System.Collections.Generic;
using System.Linq;
using System.Xml.Linq;
using SIL.Machine.Corpora;
using SIL.Machine.Tokenization;

namespace SIL.XForge.Scripture.Services;

public class SFBiblicalTermsText : IText
{
    private IEnumerable<TextSegment> _segments;

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

    public IEnumerable<TextSegment> GetSegments(bool includeText = true, IText basedOn = null) => _segments;

    private IEnumerable<TextSegment> GetSegments(
        ITokenizer<string, int, string> wordTokenizer,
        XDocument termRenderingsDoc
    )
    {
        foreach (
            XElement termRenderingElem in termRenderingsDoc.Root
                .Elements("TermRendering")
                .Where(tre => !(bool)tre.Attribute("Guess"))
        )
        {
            var id = (string)termRenderingElem.Attribute("Id");
            var renderingsStr = (string)termRenderingElem.Element("Renderings");
            string[] renderings = renderingsStr.Trim().Split("||", StringSplitOptions.RemoveEmptyEntries);

            foreach (string rendering in renderings)
            {
                string[] segment = wordTokenizer.Tokenize(rendering.Trim()).ToArray();
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
