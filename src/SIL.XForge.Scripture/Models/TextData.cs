using System.Collections.Generic;
using System.ComponentModel;
using Newtonsoft.Json;
using SIL.Scripture;
using SIL.XForge.Models;
using SIL.XForge.Realtime.RichText;

namespace SIL.XForge.Scripture.Models
{
    public class TextData : Delta, IIdentifiable
    {
        public static string GetTextDocId(string projectId, int book, int chapter,
            TextType textType = TextType.Target)
        {
            string textTypeStr;
            switch (textType)
            {
                case TextType.Target:
                    textTypeStr = "target";
                    break;
                default:
                    throw new InvalidEnumArgumentException(nameof(textType), (int)textType, typeof(TextType));
            }
            return $"{projectId}:{Canon.BookNumberToId(book)}:{chapter}:{textTypeStr}";
        }

        public TextData()
        {
        }

        public TextData(Delta delta)
            : base(delta)
        {
        }

        [JsonIgnore]
        public string Id { get; set; }

        [JsonIgnore]
        public Dictionary<string, object> ExtraElements { get; set; }
    }
}
