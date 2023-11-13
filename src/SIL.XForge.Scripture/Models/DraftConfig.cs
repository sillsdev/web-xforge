using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

public class DraftConfig
{
    public TranslateSource? AlternateSource { get; set; }
    public IList<int> LastSelectedBooks { get; set; } = new List<int>();
    public string? ServalConfig { get; set; }
}
