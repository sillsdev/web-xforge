namespace SIL.XForge.Scripture.Models;

public class SFTextSegment(
    string textId,
    object segRef,
    string segmentText,
    bool isSentenceStart,
    bool isInRange,
    bool isRangeStart
)
{
    public string SegmentText { get; } = segmentText;
    public string TextId { get; } = textId;
    public object SegmentRef { get; } = segRef;
    public bool IsEmpty { get; } = string.IsNullOrWhiteSpace(segmentText);
    public bool IsSentenceStart { get; } = isSentenceStart;
    public bool IsInRange { get; } = isInRange;
    public bool IsRangeStart { get; } = isRangeStart;
}
