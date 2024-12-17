using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

public class TextInfo
{
    public int BookNum { get; set; }
    public bool HasSource { get; set; }
    public List<Chapter> Chapters { get; set; } = [];
    public Dictionary<string, string> Permissions { get; set; } = [];
}
