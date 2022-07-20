namespace SIL.XForge.Scripture.Models
{
    /// <summary>
    /// Text-only position of a series of characters relative to the start of a verse. The position uses zero-based
    /// indexing, and should correspond to the SF DB "insert" strings of a given verse.
    /// The position does not take into account quill editor text between segments, quill embeds, USFM markup, or other
    /// formatting.
    /// For example, in the following USFM verse:
    ///     \v 1 Praise the \nd Lord\nd*, all you nations:
    ///     \q2 laud him, all you peoples.
    ///     \q
    /// (1) "Praise" has Start 0 and Length 6.
    /// (2) "all you peoples" has Start 43 and Length 15. (43 == "Praise the ".Length + "Lord".Length + ",
    ///     all you nations:".Length + "laud him, ".Length)
    /// </summary>
    public class TextAnchor
    {
        public int Start { get; set; } = 0;
        public int Length { get; set; } = 0;

        public override bool Equals(object other)
        {
            TextAnchor compared = other as TextAnchor;
            if (compared == null)
                return false;
            return Start == compared.Start && Length == compared.Length;
        }

        public override int GetHashCode()
        {
            // Do NOT insert Text Anchor objects into a hash collection since this
            // hash code is calculated using mutable properties
            int primeA = 5557;
            int primeB = 7577;
            return Start * primeA + Length * primeB;
        }
    }
}
