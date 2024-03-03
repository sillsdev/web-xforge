using System.Collections.Generic;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

public class MockText : ISFText
{
    public string Id { get; init; } = string.Empty;
    public IEnumerable<SFTextSegment> Segments { get; init; } = new List<SFTextSegment>();
}
