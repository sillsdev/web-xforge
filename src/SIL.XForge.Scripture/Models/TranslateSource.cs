using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models
{
    public class TranslateSource
    {
        public string ParatextId { get; set; }
        public string ProjectRef { get; set; }
        public string Name { get; set; }
        public string ShortName { get; set; }
        public WritingSystem WritingSystem { get; set; } = new WritingSystem();
        public bool? IsRightToLeft { get; set; }
    }
}
