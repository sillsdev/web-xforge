namespace SIL.XForge.Scripture.Models;

/// <summary>
/// Status of a draft generation build request, including states before and after Serval processing.
/// Values include Serval-reported build states as well as SF-specific pre-submission states.
/// </summary>
public enum DraftGenerationBuildStatus
{
    /// <summary>SF state. The user has requested a draft generation but it has not yet been submitted to Serval.</summary>
    UserRequested,

    /// <summary>SF state. The build has been submitted to Serval but no Serval build record exists yet.</summary>
    SubmittedToServal,

    /// <summary>Serval state. The build is pending in Serval's queue.</summary>
    Pending,

    /// <summary>Serval state. The build is actively running in Serval.</summary>
    Active,

    /// <summary>Serval state. The build completed successfully.</summary>
    Completed,

    /// <summary>Serval state. The build failed.</summary>
    Faulted,

    /// <summary>Serval state. The build was canceled.</summary>
    Canceled,
}
