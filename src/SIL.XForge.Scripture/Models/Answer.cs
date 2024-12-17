using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

public class Answer : Comment
{
    public VerseRefData? VerseRef { get; set; }
    public string? ScriptureText { get; set; }
    public List<Like> Likes { get; set; } = [];
    public List<Comment> Comments { get; set; } = [];
    public string Status { get; set; } = AnswerStatus.None;
}
