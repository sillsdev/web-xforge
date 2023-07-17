using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

public class BiblicalTermDefinition
{
    public IList<string> Categories { get; set; } = new List<string>();
    public IList<string> Domains { get; set; } = new List<string>();
    public string Gloss { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
}
