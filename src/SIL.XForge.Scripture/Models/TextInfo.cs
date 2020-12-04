using System.Collections.Generic;
using System.ComponentModel;
using MongoDB.Bson.Serialization.Attributes;

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

    [BsonIgnoreExtraElements]
    public class TextInfo
    {
        public int BookNum { get; set; }
        public bool HasSource { get; set; }
        public List<Chapter> Chapters { get; set; } = new List<Chapter>();
    }
}
