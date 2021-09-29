namespace SIL.XForge.Scripture.Models
{
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
            return Start * 31 + Length * 31;
        }
    }
}
