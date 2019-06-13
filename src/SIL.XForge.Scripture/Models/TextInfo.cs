using System.Collections.Generic;
using System.ComponentModel;

namespace SIL.XForge.Scripture.Models
{
    public enum TextType
    {
        Target,
        Source
    }

    public class TextInfo
    {
        public static string GetTextDocId(string projectId, string bookId, int chapter, TextType? textType = null)
        {
            string textTypeStr = "target";
            if (textType != null)
            {
                switch (textType)
                {
                    case TextType.Source:
                        textTypeStr = "source";
                        break;
                    case TextType.Target:
                        textTypeStr = "target";
                        break;
                    default:
                        throw new InvalidEnumArgumentException(nameof(textType), (int)textType, typeof(TextType));
                }
            }
            return $"{projectId}:{bookId}:{chapter}:{textTypeStr}";
        }

        public string BookId { get; set; }
        public string Name { get; set; }
        public bool HasSource { get; set; }
        public List<Chapter> Chapters { get; set; } = new List<Chapter>();
    }
}
