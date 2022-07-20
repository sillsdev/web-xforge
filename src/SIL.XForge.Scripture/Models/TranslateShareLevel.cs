namespace SIL.XForge.Scripture.Models
{
    /// <summary>Type of sharing for translate tool.</summary>
    public static class TranslateShareLevel
    {
        /// <summary>Anyone can access the project via a share URL.</summary>
        public const string Anyone = "anyone";

        /// <summary>Invited people can only access the project via an invitation URL unique to them.</summary>
        public const string Specific = "specific";
    }
}
