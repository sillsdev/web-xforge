using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

public class DraftConfig
{
    public TranslateSource? AlternateSource { get; set; }
    public IList<int> LastSelectedBooks { get; set; } = new List<int>();
    public bool TrainOnEnabled { get; set; }
    public TranslateSource? TrainOnSource { get; set; }
}
