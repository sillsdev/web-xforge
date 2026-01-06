namespace SIL.XForge.Scripture.Models;

public class DraftApplyState
{
    public int BookNum { get; set; }
    public int ChapterNum { get; set; }
    public int TotalChapters { get; set; }
    public string? Message { get; set; }
    public DraftApplyStatus Status { get; set; }
}
