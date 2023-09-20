using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models;

public class BiblicalTerm : ProjectData
{
    public string DataId { get; set; } = string.Empty;
    public string TermId { get; set; } = string.Empty;
    public string Transliteration { get; set; } = string.Empty;
    public IList<string> Renderings { get; set; } = new List<string>();
    public string Description { get; set; } = string.Empty;
    public string Language { get; set; } = string.Empty;
    public IList<string> Links { get; set; } = new List<string>();
    public IList<int> References { get; set; } = new List<int>();
    public IDictionary<string, BiblicalTermDefinition> Definitions { get; set; } =
        new Dictionary<string, BiblicalTermDefinition>();
}
