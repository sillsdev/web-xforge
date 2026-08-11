using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// Execution data from a Serval translation build, including training and pretranslation counts
/// and the language tags used during the build.
/// </summary>
public record ServalBuildExecutionData
{
    public int TrainCount { get; init; }
    public int PretranslateCount { get; init; }
    public bool? IsTrainFilteredByChapter { get; init; }
    public bool? IsPretranslateFilteredByChapter { get; init; }
    public string? SourceLanguageTag { get; init; }
    public string? TargetLanguageTag { get; init; }
    public string? ResolvedSourceLanguage { get; init; }
    public string? ResolvedTargetLanguage { get; init; }
    public double? AveragePretranslationConfidence { get; init; }
    public List<ServalBuildDiagnostic> Diagnostics { get; } = [];
    public bool? DiagnosticsTruncated { get; init; }
}

public record ServalBuildDiagnostic
{
    public required string Code { get; init; }
    public required string Category { get; init; }
    public required string Message { get; init; }
    public required ServalDiagnosticSeverity Severity { get; init; }
    public required Dictionary<string, object> Data { get; init; }
}

public enum ServalDiagnosticSeverity
{
    Info,
    Warn,
    Error,
}
