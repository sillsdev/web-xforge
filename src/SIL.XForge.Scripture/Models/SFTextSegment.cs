using System.Collections.Generic;
using System.Linq;

namespace SIL.XForge.Scripture.Models;

public class SFTextSegment(
    IEnumerable<string> segRef,
    string segmentText,
    bool isSentenceStart,
    bool isInRange,
    bool isRangeStart
)
{
    public string SegmentRef { get; } =
        string.Join('_', segRef.Select(k => int.TryParse(k, out int _) ? k.PadLeft(3, '0') : k))
            .Replace('\n', '_')
            .Replace('\t', '_');
    public string SegmentText { get; } = segmentText;
    public bool IsEmpty { get; } = string.IsNullOrWhiteSpace(segmentText);
    public bool IsInRange { get; } = isInRange;
    public bool IsRangeStart { get; } = isRangeStart;
    public bool IsSentenceStart { get; } = isSentenceStart;
}
