namespace SIL.XForge.Scripture.Models;

public class NoteTag
{
    public const string defaultTagIcon = "01flag1";
    public const string sfNoteTagIcon = "06star2";
    public const string sfNoteTagName = "Scripture Forge Note";
    public const int notSetId = 0;
    public int TagId { get; set; }
    public string Icon { get; set; }
    public string Name { get; set; }
    public bool CreatorResolve { get; set; }
}
