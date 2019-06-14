using System;

namespace SIL.XForge.Scripture.Models
{
    public class Comment
    {
        public string Id { get; set; }
        public string OwnerRef { get; set; }
        public string ProjectRef { get; set; }
        public string AnswerRef { get; set; }
        public VerseRefData ScriptureStart { get; set; }
        public VerseRefData ScriptureEnd { get; set; }
        public string Text { get; set; }
        public string AudioUrl { get; set; }
        public DateTime DateModified { get; set; }
        public DateTime DateCreated { get; set; }
    }
}
