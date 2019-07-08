using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models
{
    public class SFProjectData
    {
        public List<TextInfo> Texts { get; set; } = new List<TextInfo>();
        public Sync Sync { get; set; } = new Sync();
    }
}
