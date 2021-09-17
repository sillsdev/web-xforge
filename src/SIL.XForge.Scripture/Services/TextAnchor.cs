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
            return base.GetHashCode();
        }
    }
}
