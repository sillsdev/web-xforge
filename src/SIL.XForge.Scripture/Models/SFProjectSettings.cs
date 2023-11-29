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
    public bool? TranslateShareEnabled { get; set; }

    // pre-translation settings
    public string? AlternateSourceParatextId { get; set; }
    public bool? AlternateTrainingSourceEnabled { get; set; }
    public string? AlternateTrainingSourceParatextId { get; set; }

    // checking settings
    public bool? CheckingEnabled { get; set; }
    public bool? UsersSeeEachOthersResponses { get; set; }
    public bool? CheckingShareEnabled { get; set; }
    public string? CheckingAnswerExport { get; set; }
    public bool? HideCommunityCheckingText { get; set; }
}
