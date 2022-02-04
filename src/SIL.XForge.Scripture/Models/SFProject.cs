using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models
{
    /// <summary>Description of an SF project.</summary>
    public class SFProject : Project
    {
        public string ParatextId { get; set; }
        public string ShortName { get; set; }
        public WritingSystem WritingSystem { get; set; } = new WritingSystem();
        public bool? IsRightToLeft { get; set; }
        public TranslateConfig TranslateConfig { get; set; } = new TranslateConfig();
        public CheckingConfig CheckingConfig { get; set; } = new CheckingConfig();
        public List<TextInfo> Texts { get; set; } = new List<TextInfo>();
        public Sync Sync { get; set; } = new Sync();
        public List<ParatextUserProfile> ParatextUsers { get; set; } = new List<ParatextUserProfile>();
    }
}
