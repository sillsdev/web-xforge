using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

public class DraftConfig
{
    public bool AdditionalTrainingData { get; set; }
    public bool AdditionalTrainingSourceEnabled { get; set; }
    public TranslateSource? AdditionalTrainingSource { get; set; }
    public bool AlternateSourceEnabled { get; set; }
    public TranslateSource? AlternateSource { get; set; }
    public bool AlternateTrainingSourceEnabled { get; set; }
    public TranslateSource? AlternateTrainingSource { get; set; }
    public IList<int> LastSelectedTrainingBooks { get; set; } = [];
    public string? LastSelectedTrainingScriptureRange { get; set; }
    public IList<ProjectScriptureRange> LastSelectedTrainingScriptureRanges { get; set; } = [];
    public IList<string> LastSelectedTrainingDataFiles { get; set; } = [];
    public IList<int> LastSelectedTranslationBooks { get; set; } = [];
    public string? LastSelectedTranslationScriptureRange { get; set; }
    public IList<ProjectScriptureRange> LastSelectedTranslationScriptureRanges { get; set; } = [];
    public string? ServalConfig { get; set; }
}
