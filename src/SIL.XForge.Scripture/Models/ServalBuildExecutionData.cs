namespace SIL.XForge.Scripture.Models;

/// <summary>
/// Execution data from a Serval translation build, including training and pretranslation counts
/// and the language tags used during the build.
/// </summary>
public class ServalBuildExecutionData
{
    public int TrainCount { get; set; }
    public int PretranslateCount { get; set; }
    public string? SourceLanguageTag { get; set; }
    public string? TargetLanguageTag { get; set; }
}
