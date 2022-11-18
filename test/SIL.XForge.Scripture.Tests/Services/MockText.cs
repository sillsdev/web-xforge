namespace SIL.XForge.Scripture.Services
{
    using SIL.Machine.Corpora;
    using System.Collections.Generic;

    public class MockText : IText
    {
        public IEnumerable<TextSegment> GetSegments(bool includeText = true, IText? basedOn = null)
        {
            return Segments;
        }

        public string Id { get; set; } = string.Empty;
        public List<TextSegment> Segments { get; set; } = new List<TextSegment>();
        public string? SortKey { get; set; }
    }
}
