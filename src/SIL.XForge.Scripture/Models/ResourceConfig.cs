namespace SIL.XForge.Scripture.Models
{
    using System;

    /// <summary>
    /// Contains configuration information for Paratext resources.
    /// </summary>
    public class ResourceConfig
    {
        public DateTime CreatedTimestamp { get; set; }
        public string ManifestChecksum { get; set; }
        public string PermissionsChecksum { get; set; }
        public int Revision { get; set; }
    }
}
