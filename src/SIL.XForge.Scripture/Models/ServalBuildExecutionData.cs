using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// Execution data from a Serval translation build, including training and pretranslation counts
/// and the language tags used during the build.
/// </summary>
public class ServalBuildExecutionData
{
    public double? AveragePretranslationConfidence { get; init; }
    public bool? IsPretranslateFilteredByChapter { get; init; }
    public bool? IsTrainFilteredByChapter { get; init; }
    public int TrainCount { get; init; }
    public int PretranslateCount { get; init; }
    public string? ResolvedSourceLanguage { get; init; }
    public string? ResolvedTargetLanguage { get; init; }
    public string? SourceLanguageTag { get; init; }
    public string? TargetLanguageTag { get; init; }
    public required IReadOnlyList<string> Warnings { get; init; }
}
