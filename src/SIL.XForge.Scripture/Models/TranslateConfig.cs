namespace SIL.XForge.Scripture.Models;

public class TranslateConfig
{
    public bool TranslationSuggestionsEnabled { get; set; }
    public TranslateSource Source { get; set; }
    public bool ShareEnabled { get; set; } = false;
    public int? DefaultNoteTagId { get; set; }
}
