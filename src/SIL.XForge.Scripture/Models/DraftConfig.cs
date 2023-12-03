using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

public class DraftConfig
{
    public TranslateSource? AlternateSource { get; set; }
    public bool AlternateTrainingSourceEnabled { get; set; }
    public TranslateSource? AlternateTrainingSource { get; set; }
    public IList<int> LastSelectedTrainingBooks { get; set; } = new List<int>();
    public IList<int> LastSelectedTranslationBooks { get; set; } = new List<int>();
    public string? ServalConfig { get; set; }
}
