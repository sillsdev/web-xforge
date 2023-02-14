using System.Collections.Generic;
using System.Xml.Linq;
using SIL.XForge.Realtime.RichText;

namespace SIL.XForge.Scripture.Services;

public class ChapterDelta
{
    public ChapterDelta(int number, int lastVerse, bool isValid, Delta delta)
    {
        Number = number;
        LastVerse = lastVerse;
        IsValid = isValid;
        Delta = delta;
    }

    public int Number { get; }
    public int LastVerse { get; }
    public bool IsValid { get; }
    public Delta Delta { get; }
}

public interface IDeltaUsxMapper
{
    IEnumerable<ChapterDelta> ToChapterDeltas(XDocument usxDoc);
    XDocument ToUsx(XDocument oldUsxDoc, IEnumerable<ChapterDelta> chapterDeltas);
}
