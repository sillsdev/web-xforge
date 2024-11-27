using System;
using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

public class ServalBuildAdditionalInfo
{
    public string BuildId { get; init; } = string.Empty;
    public IEnumerable<string>? CorporaIds { get; init; }
    public DateTimeOffset? DateFinished { get; init; }
    public IEnumerable<string>? ParallelCorporaIds { get; init; }
    public int Step { get; init; }
    public string TranslationEngineId { get; init; } = string.Empty;
}
