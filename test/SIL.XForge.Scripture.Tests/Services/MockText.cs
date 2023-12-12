using System.Collections.Generic;
using SIL.Machine.Corpora;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

public class MockText : ISFText
{
    public IEnumerable<TextSegment> GetSegments(bool includeText = true, IText? basedOn = null) => Segments;

    public string Id { get; init; } = string.Empty;
    public IEnumerable<SFTextSegment> Segments { get; init; } = new List<SFTextSegment>();
    public string? SortKey => null;
}
