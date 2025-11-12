using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

public class DraftConfig
{
    public IList<TranslateSource> DraftingSources { get; set; } = [];
    public IList<TranslateSource> TrainingSources { get; set; } = [];
    public IList<ProjectScriptureRange> LastSelectedTrainingScriptureRanges { get; set; } = [];
    public IList<string> LastSelectedTrainingDataFiles { get; set; } = [];
    public IList<ProjectScriptureRange> LastSelectedTranslationScriptureRanges { get; set; } = [];
    public bool? FastTraining { get; set; }
    public bool? UseEcho { get; set; }
    public string? ServalConfig { get; set; }
    public DraftUsfmConfig? UsfmConfig { get; set; }
    public bool? SendEmailOnBuildFinished { get; set; }

    /// <summary>
    /// A scripture range containing the books that are in the current draft on Serval.
    /// </summary>
    public string? CurrentScriptureRange { get; set; }

    /// <summary>
    /// A scripture range containing the books that have been drafted and are available in Scripture Forge.
    /// </summary>
    public string? DraftedScriptureRange { get; set; }
}
