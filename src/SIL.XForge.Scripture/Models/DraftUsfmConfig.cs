namespace SIL.XForge.Scripture.Models;

public static class ParagraphBreakFormatOptions
{
    public const string Remove = "remove";
    public const string BestGuess = "best_guess";
    public const string MoveToEnd = "move_to_end";
}

public static class QuoteStyleOptions
{
    public const string Denormalized = "denormalized";
    public const string Normalized = "normalized";
}

public class DraftUsfmConfig
{
    public string ParagraphBreakFormat { get; set; } = ParagraphBreakFormatOptions.BestGuess;
    public string QuoteStyle { get; set; } = QuoteStyleOptions.Denormalized;
}
