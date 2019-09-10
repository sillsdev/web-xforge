using System;
using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models
{
    public class Question : ProjectData
    {
        public string DataId { get; set; }
        public VerseRefData ScriptureStart { get; set; }
        public VerseRefData ScriptureEnd { get; set; }
        public string Text { get; set; }
        public string AudioUrl { get; set; }
        public List<Answer> Answers { get; set; } = new List<Answer>();
        public bool IsArchived { get; set; }
        public DateTime? DateArchived { get; set; }
        public DateTime DateModified { get; set; }
        public DateTime DateCreated { get; set; }
    }
}
