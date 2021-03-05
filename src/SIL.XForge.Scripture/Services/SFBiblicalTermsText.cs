using System;
using System.Linq;
using System.Xml.Linq;
using System.Collections.Generic;
using SIL.Machine.Corpora;
using SIL.Machine.Tokenization;

namespace SIL.XForge.Scripture.Services
{
    public class SFBiblicalTermsText : IText
    {
        public SFBiblicalTermsText(ITokenizer<string, int, string> wordTokenizer, string projectId,
            XDocument termRenderingsDoc)
        {
            Id = $"{projectId}_biblical_terms";

            Segments = GetSegments(wordTokenizer, termRenderingsDoc).OrderBy(s => s.SegmentRef).ToArray();
        }

        public string Id { get; }

        public string SortKey => Id;

        public IEnumerable<TextSegment> Segments { get; }

        private static IEnumerable<TextSegment> GetSegments(ITokenizer<string, int, string> wordTokenizer,
            XDocument termRenderingsDoc)
        {
            foreach (XElement termRenderingElem in termRenderingsDoc.Root.Elements("TermRendering")
                .Where(tre => !(bool)tre.Attribute("Guess")))
            {
                var id = (string)termRenderingElem.Attribute("Id");
                var renderingsStr = (string)termRenderingElem.Element("Renderings");
                string[] renderings = renderingsStr.Trim().Split("||", StringSplitOptions.RemoveEmptyEntries);

                foreach (string rendering in renderings)
                {
                    string[] segment = wordTokenizer.Tokenize(rendering.Trim()).ToArray();
                    yield return new TextSegment(new TextSegmentRef(id), segment);
                }
            }
        }
    }
}
