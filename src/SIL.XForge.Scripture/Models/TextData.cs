using System.Collections.Generic;
using Newtonsoft.Json;
using SIL.Scripture;
using SIL.XForge.Models;
using SIL.XForge.Realtime.RichText;

namespace SIL.XForge.Scripture.Models
{
    public class TextData : Delta, IIdentifiable
    {
        public static string GetTextDocId(string projectId, int book, int chapter)
        {
            return $"{projectId}:{Canon.BookNumberToId(book)}:{chapter}:target";
        }

        public TextData() { }

        public TextData(Delta delta) : base(delta) { }

        [JsonIgnore]
        public string Id { get; set; }

        [JsonIgnore]
        public Dictionary<string, object> ExtraElements { get; set; }
    }
}
