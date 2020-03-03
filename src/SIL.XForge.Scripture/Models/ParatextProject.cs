namespace SIL.XForge.Scripture.Models
{
    /// <summary>Description of a project on the Paratext server.</summary>
    public class ParatextProject
    {
        public string ParatextId { get; set; }
        public string Name { get; set; }
        public string ShortName { get; set; }
        public string LanguageTag { get; set; }
        public string SFProjectId { get; set; }
        /// <summary>Either the SF project exists and the SF user hasn't been added to the SF project, or the SF project doesn't exist and the user is the administrator.</summary>
        public bool IsConnectable { get; set; }
        /// <summary>A SF project exists in the SF DB that syncs to a project on the Paratext server.</summary>
        public bool IsConnected { get; set; }
    }
}
