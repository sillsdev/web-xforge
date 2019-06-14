using System;
using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models
{
    public class Answer
    {
        public string Id { get; set; }
        public string OwnerRef { get; set; }
        public VerseRefData ScriptureStart { get; set; }
        public VerseRefData ScriptureEnd { get; set; }
        public string Text { get; set; }
        public string AudioUrl { get; set; }
        public List<Like> Likes { get; set; }
        public DateTime DateModified { get; set; }
        public DateTime DateCreated { get; set; }
    }
}
