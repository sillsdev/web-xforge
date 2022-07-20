namespace SIL.XForge.Scripture.Models
{
    /// <summary>Type of sharing for community checking.</summary>
    public static class CheckingShareLevel
    {
        /// <summary>Anyone can access the project via a share URL.</summary>
        public const string Anyone = "anyone";

        /// <summary>Invited people can only access the project via an invitation URL unique to them.</summary>
        public const string Specific = "specific";
    }
}
