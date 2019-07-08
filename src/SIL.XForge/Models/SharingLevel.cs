namespace SIL.XForge.Models
{
    /// <summary>Type of sharing for a project.</summary>
    public static class SharingLevel
    {
        /// <summary>Anyone can access the project via a share URL.</summary>
        public const string Anyone = "anyone";
        /// <summary>Invited people can only access the project via an invitation URL unique to them.</summary>
        public const string Specific = "specific";
    }
}
