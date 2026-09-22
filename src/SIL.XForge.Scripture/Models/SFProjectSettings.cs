using System;
using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// This class represents the project settings that can be updated using
/// <see cref="SIL.XForge.Scripture.Controllers.SFProjectsRpcController.UpdateSettings"/>.
/// </summary>
public class SFProjectSettings
{
    // translate settings
    [Obsolete("To prevent serialization errors for settings from older frontend clients. Deprecated August 2026.")]
    public bool? TranslationSuggestionsEnabled { get; set; }
    public string? SourceParatextId { get; set; }
    public bool? BiblicalTermsEnabled { get; set; }

    [Obsolete("To prevent serialization errors for settings from older frontend clients. Deprecated September 2026.")]
    public IEnumerable<string>? AdditionalTrainingDataFiles { get; set; }

    [Obsolete("To prevent serialization errors for settings from older frontend clients. Deprecated September 2026.")]
    public IEnumerable<string>? DraftingSourcesParatextIds { get; set; }

    [Obsolete("To prevent serialization errors for settings from older frontend clients. Deprecated September 2026.")]
    public IEnumerable<string>? TrainingSourcesParatextIds { get; set; }

    // checking settings
    public bool? CheckingEnabled { get; set; }
    public bool? UsersSeeEachOthersResponses { get; set; }
    public string? CheckingAnswerExport { get; set; }
    public bool? HideCommunityCheckingText { get; set; }

    // lynx settings
    public bool? LynxAutoCorrectionsEnabled { get; set; }
    public bool? LynxAssessmentsEnabled { get; set; }
    public bool? LynxPunctuationCheckerEnabled { get; set; }
    public bool? LynxAllowedCharacterCheckerEnabled { get; set; }
}
