using SIL.XForge.Realtime;

namespace SIL.XForge.Scripture.Models;

public class TextSnapshot : Snapshot<TextData>
{
    /// <summary>
    /// Whether the TextData is valid or not.
    /// </summary>
    public bool IsValid { get; set; }
}
