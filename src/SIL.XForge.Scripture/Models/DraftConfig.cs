using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

public class DraftConfig
{
    public IList<TranslateSource> DraftingSources { get; set; } = [];
    public IList<TranslateSource> TrainingSources { get; set; } = [];
    public IList<ProjectScriptureRange> LastSelectedTrainingScriptureRanges { get; set; } = [];
    public IList<string> LastSelectedTrainingDataFiles { get; set; } = [];

    /// <summary>
    /// The training data files that were available to choose from at the time of the last build. Used to distinguish
    /// newly added files (which default to selected) from files the user deliberately deselected. <c>null</c> for
    /// builds made before this was recorded (an empty list means a build recorded that zero files were available).
    /// </summary>
    public IList<string>? LastAvailableTrainingDataFiles { get; set; }
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
    /// <remarks>
    /// This is a combination of the scripture ranges of previous drafts.
    /// </remarks>
    public string? DraftedScriptureRange { get; set; }
    public bool? DraftInProgress { get; set; }
    public bool? LastDraftSuccessful { get; set; }

    /// <summary>
    /// Gets or sets the available drafting engines.
    /// </summary>
    /// <remarks>If this is <c>null</c>, only Nmt will be available.</remarks>
    public HashSet<string>? AvailableDraftingEngines { get; set; }

    /// <summary>
    /// Gets or sets the currently selected drafting engine to use by default for the next build.
    /// </summary>
    /// <remarks>
    /// This may not necessarily be the drafting engine used for the current build, as the curent build may have
    /// specified its own value for the <see cref="BuildConfig.DraftingEngine"/>, or this value may have been changed
    /// while a build is under way.
    /// </remarks>
    public string? DraftingEngine { get; set; }
}
