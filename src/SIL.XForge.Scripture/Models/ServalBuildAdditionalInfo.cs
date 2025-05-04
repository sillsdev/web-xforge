using System;
using System.Collections.Generic;

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
    public string TranslationEngineId { get; init; } = string.Empty;
    public HashSet<ProjectScriptureRange> TranslationScriptureRanges { get; init; } = [];
}
