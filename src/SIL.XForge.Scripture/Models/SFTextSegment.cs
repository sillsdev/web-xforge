using System.Collections.Generic;
using SIL.Machine.Corpora;

namespace SIL.XForge.Scripture.Models;

public class SFTextSegment : TextSegment
{
    public SFTextSegment(
        string textId,
        object segRef,
        string segmentText,
        IReadOnlyList<string> segment,
        bool isSentenceStart,
        bool isInRange,
        bool isRangeStart,
        bool isEmpty
    )
        : base(textId, segRef, segment, isSentenceStart, isInRange, isRangeStart, isEmpty) => SegmentText = segmentText;

    /// <summary>
    /// Gets or sets the segment text.
    /// </summary>
    /// <returns>The original segment text for Serval.</returns>
    public string SegmentText { get; }
}
