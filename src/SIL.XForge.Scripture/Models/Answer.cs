using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models
{
    public class Answer : Comment
    {
        public VerseRefData VerseRef { get; set; }
        public string ScriptureText { get; set; }
        public string AudioUrl { get; set; }
        public List<Like> Likes { get; set; } = new List<Like>();
        public List<Comment> Comments { get; set; } = new List<Comment>();
    }
}
