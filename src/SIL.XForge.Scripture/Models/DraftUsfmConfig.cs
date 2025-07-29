namespace SIL.XForge.Scripture.Models;

public static class ParagraphBreakFormat
{
    public const string Remove = "remove";
    public const string BestGuess = "best_guess";
    public const string MoveToEnd = "move_to_end";
}

public static class QuoteStyle
{
    public const string Automatic = "automatic";
    public const string Straight = "straight";
}

public class DraftUsfmConfig
{
    public string ParagraphFormat { get; set; } = ParagraphBreakFormat.BestGuess;
    public string QuoteFormat { get; set; } = QuoteStyle.Automatic;
}
