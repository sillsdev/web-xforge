namespace SIL.XForge.Scripture.Services
{
    using SIL.Machine.Corpora;
    using System.Collections.Generic;

    public class MockText : IText
    {
        public IEnumerable<TextSegment> GetSegments(bool includeText = true, IText basedOn = null)
        {
            return Segments;
        }

        public string Id { get; set; }
        public List<TextSegment> Segments { get; set; }
        public string SortKey { get; set; }
    }
}
