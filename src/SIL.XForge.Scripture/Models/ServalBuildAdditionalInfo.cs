using System;
using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

public class ServalBuildAdditionalInfo
{
    public string BuildId { get; set; } = string.Empty;
    public IEnumerable<string>? CorporaIds { get; set; }
    public DateTimeOffset? DateFinished { get; set; }
    public int Step { get; set; }
    public string TranslationEngineId { get; set; } = string.Empty;
}
