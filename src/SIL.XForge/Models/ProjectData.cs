namespace SIL.XForge.Models
{
    public abstract class ProjectData : Json0Snapshot, IOwnedData
    {
        public string OwnerRef { get; set; }
        public string ProjectRef { get; set; }
    }
}
