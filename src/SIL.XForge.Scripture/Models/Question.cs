using System;
using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models
{
    public class Question
    {
        public string Id { get; set; }
        public string OwnerRef { get; set; }
        public VerseRefData ScriptureStart { get; set; }
        public VerseRefData ScriptureEnd { get; set; }
        public string Text { get; set; }
        public string AudioUrl { get; set; }
        public List<Answer> Answers { get; set; } = new List<Answer>();
        public bool IsArchived { get; set; }
        public DateTime? DateArchived { get; set; }
    }
}
