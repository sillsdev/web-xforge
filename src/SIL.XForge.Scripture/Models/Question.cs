using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models
{
    public class Question
    {
        public string Id { get; set; }
        public string OwnerRef { get; set; }
        public string Source { get; set; }
        public VerseRefData ScriptureStart { get; set; }
        public VerseRefData ScriptureEnd { get; set; }
        // used by Transcelerator to identify question (don't display to user)
        public string TextEn { get; set; }
        public string Text { get; set; }
        public string AudioUrl { get; set; }
        public string ModelAnswer { get; set; }
        public List<Answer> Answers { get; set; } = new List<Answer>();
    }
}
