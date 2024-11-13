using System;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// This class represents the project settings that can be updated using
/// <see cref="SIL.XForge.Scripture.Controllers.SFProjectsRpcController.UpdateSettings"/>.
/// </summary>
public class SFProjectSettings
{
    // translate settings
    public bool? TranslationSuggestionsEnabled { get; set; }
    public string? SourceParatextId { get; set; }
    public bool? BiblicalTermsEnabled { get; set; }

    [Obsolete("For backwards compatibility with older frontend clients. Deprecated November 2024.")]
    public bool? TranslateShareEnabled { get; set; }

    // pre-translation settings
    public bool? AdditionalTrainingData { get; set; }
    public bool? AdditionalTrainingSourceEnabled { get; set; }
    public string? AdditionalTrainingSourceParatextId { get; set; }
    public bool? AlternateSourceEnabled { get; set; }
    public string? AlternateSourceParatextId { get; set; }
    public bool? AlternateTrainingSourceEnabled { get; set; }
    public string? AlternateTrainingSourceParatextId { get; set; }

    // checking settings
    public bool? CheckingEnabled { get; set; }
    public bool? UsersSeeEachOthersResponses { get; set; }

    [Obsolete("For backwards compatibility with older frontend clients. Deprecated November 2024.")]
    public bool? CheckingShareEnabled { get; set; }
    public string? CheckingAnswerExport { get; set; }
    public bool? HideCommunityCheckingText { get; set; }
}
