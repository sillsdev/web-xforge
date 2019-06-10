namespace SIL.XForge.Models
{
    public static class ShareLevel
    {
        public const string Anyone = "anyone";
        public const string Specific = "specific";
    }

    public class ShareConfig
    {
        public bool Enabled { get; set; } = true;

        public string Level { get; set; } = ShareLevel.Specific;
    }
}
