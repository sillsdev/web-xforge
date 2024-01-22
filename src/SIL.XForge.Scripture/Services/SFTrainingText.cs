using System.Collections.Generic;
using SIL.Machine.Corpora;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// An implementation of <see cref="ISFText"/> specifically for non-scripture training texts.
/// </summary>
public class SFTrainingText : ISFText
{
    public string Id { get; init; } = string.Empty;
    public string SortKey => Id;
    public IEnumerable<SFTextSegment> Segments { get; init; } = new List<SFTextSegment>();

    public IEnumerable<TextSegment> GetSegments(bool includeText = true, IText? basedOn = null) => Segments;
}
