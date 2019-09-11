using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models
{
    public class SFProject : Project
    {
        public string ParatextId { get; set; }
        public TranslateConfig TranslateConfig { get; set; } = new TranslateConfig();
        public CheckingConfig CheckingConfig { get; set; } = new CheckingConfig();
        public List<TextInfo> Texts { get; set; } = new List<TextInfo>();
        public Sync Sync { get; set; } = new Sync();
    }
}
