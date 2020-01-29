using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models
{
    public enum TextType
    {
        Target,
        Source
    }

    public class TextInfo
    {
        public int BookNum { get; set; }

        public bool HasSource { get; set; }

        public List<Chapter> Chapters { get; set; } = new List<Chapter>();
    }
}
