namespace SIL.XForge.Scripture.Models;

public class TranslateConfig
{
    public bool TranslationSuggestionsEnabled { get; set; }
    public TranslateSource? Source { get; set; }
    public int? DefaultNoteTagId { get; set; }
    public bool PreTranslate { get; set; }
    public DraftConfig DraftConfig { get; set; } = new DraftConfig();

    /// <summary>
    /// Gets or sets the project type.
    /// </summary>
    /// <value>The string value of the project type enumeration.</value>
    public string? ProjectType { get; set; }

    /// <summary>
    /// Gets or sets the base project.
    /// </summary>
    /// <value>The base project, if specified in the ScrText settings.</value>
    public BaseProject? BaseProject { get; set; }
}
