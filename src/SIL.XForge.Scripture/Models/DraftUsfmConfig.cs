namespace SIL.XForge.Scripture.Models;

public enum ParagraphBreakFormat
{
    Remove,
    BestGuess,
    MoveToEnd,
}

public class DraftUsfmConfig
{
    public ParagraphBreakFormat ParagraphFormat { get; set; } = ParagraphBreakFormat.MoveToEnd;
}
