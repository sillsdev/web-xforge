using System.Collections.Generic;
using SIL.Machine.Corpora;

namespace SIL.XForge.Scripture.Services;

public class MockText : IText
{
    public IEnumerable<TextSegment> GetSegments(bool includeText = true, IText? basedOn = null) => Segments;

    public string Id { get; set; } = string.Empty;
    public List<TextSegment> Segments { get; set; } = new List<TextSegment>();
    public string? SortKey { get; set; }
}
