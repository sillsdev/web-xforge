namespace SIL.XForge.Scripture.Models
{
    public class SegmentSelection
    {
        public int Start { get; set; } = 0;
        public int End { get; set; } = 0;

        public bool Equals(SegmentSelection other)
        {
            return Start == other.Start && End == other.End;
        }
    }
}
