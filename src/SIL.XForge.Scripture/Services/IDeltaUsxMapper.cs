using System.Collections.Generic;
using System.Xml.Linq;
using SIL.XForge.Realtime.RichText;

namespace SIL.XForge.Scripture.Services;

public class ChapterDelta(int number, int lastVerse, bool isValid, Delta delta)
{
    public int Number { get; } = number;
    public int LastVerse { get; } = lastVerse;
    public bool IsValid { get; } = isValid;
    public Delta Delta { get; } = delta;
}

public interface IDeltaUsxMapper
{
    IEnumerable<ChapterDelta> ToChapterDeltas(XDocument usxDoc);
    XDocument ToUsx(XDocument oldUsxDoc, IEnumerable<ChapterDelta> chapterDeltas);
}
