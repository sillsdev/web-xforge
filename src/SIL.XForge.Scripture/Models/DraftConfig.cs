using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

public class DraftConfig
{
    public bool AdditionalTrainingData { get; set; }
    public bool AlternateSourceEnabled { get; set; }
    public TranslateSource? AlternateSource { get; set; }
    public bool AlternateTrainingSourceEnabled { get; set; }
    public TranslateSource? AlternateTrainingSource { get; set; }
    public IList<int> LastSelectedTrainingBooks { get; set; } = new List<int>();
    public string? LastSelectedTrainingScriptureRange { get; set; }
    public IList<string> LastSelectedTrainingDataFiles { get; set; } = new List<string>();
    public IList<int> LastSelectedTranslationBooks { get; set; } = new List<int>();
    public string? LastSelectedTranslationScriptureRange { get; set; }
    public string? ServalConfig { get; set; }
}
