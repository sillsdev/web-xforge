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
    /// <summary>
    /// Gets the segment reference.
    /// </summary>
    /// <remarks>
    /// We pad the verse number in the SegmentKey so the string based key comparison in Machine will be accurate.
    /// If the int does not parse successfully, it will be because it is a Biblical Term - which has a Greek or
    /// Hebrew word as the key, or because the verse number is unusual (i.e. 12a or 12-13). Usually the key is
    /// a standard verse number, so will be at most in the hundreds.
    /// We also strip characters from the key that will corrupt the line.
    /// </remarks>
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
