using System.Collections.Generic;
using System.ComponentModel;

namespace SIL.XForge.Scripture.Models
{
    public enum TextType
    {
        Target,
        Source
    }

    public class TextTypeUtils
    {
        public static string DirectoryName(TextType textType)
        {
            string textTypeDir;
            switch (textType)
            {
                case TextType.Target:
                    textTypeDir = "target";
                    break;
                case TextType.Source:
                    textTypeDir = "source";
                    break;
                default:
                    throw new InvalidEnumArgumentException(nameof(textType), (int)textType, typeof(TextType));
            }
            return textTypeDir;
        }
    }

    public class TextInfo
    {
        public int BookNum { get; set; }
        public bool HasSource { get; set; }
        public List<Chapter> Chapters { get; set; } = new List<Chapter>();
        public Dictionary<string, string> Permissions { get; set; } = new Dictionary<string, string>();
        public Dictionary<string, string> SourcePermissions { get; set; } = new Dictionary<string, string>();
    }
}
