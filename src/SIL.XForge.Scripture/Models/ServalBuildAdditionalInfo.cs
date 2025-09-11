using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using SIL.Converters.Usj;

namespace SIL.XForge.Scripture.Models;

public class ServalBuildAdditionalInfo
{
    public string BuildId { get; init; } = string.Empty;
    public IEnumerable<string>? CorporaIds { get; init; }
    public DateTimeOffset? DateFinished { get; init; }
    public DateTimeOffset? DateGenerated { get; set; }
    public DateTimeOffset? DateRequested { get; set; }
    public IEnumerable<string>? ParallelCorporaIds { get; init; }
    public string? RequestedByUserId { get; set; }
    public int Step { get; init; }
    public HashSet<ProjectScriptureRange> TrainingScriptureRanges { get; init; } = [];
    public HashSet<string> TrainingDataFileIds { get; init; } = [];
    public string TranslationEngineId { get; init; } = string.Empty;
    public HashSet<ProjectScriptureRange> TranslationScriptureRanges { get; init; } = [];

    [JsonConverter(typeof(StringEnumConverter), typeof(LowerCaseNamingStrategy))]
    public QuotationAnalysis QuotationDenormalization { get; set; } = QuotationAnalysis.Unsuccessful;
}

public enum QuotationAnalysis
{
    Successful,
    Unsuccessful,
}
