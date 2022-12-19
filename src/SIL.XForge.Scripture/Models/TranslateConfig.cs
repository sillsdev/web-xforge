namespace SIL.XForge.Scripture.Models
{
    public class TranslateConfig
    {
        public bool TranslationSuggestionsEnabled { get; set; }
        public TranslateSource Source { get; set; }
        public bool ShareEnabled { get; set; } = false;

        // TODO: Migrate to remove this from every project
        public string ShareLevel { get; set; }
    }
}
