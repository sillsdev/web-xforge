using System.Collections.Generic;
using System.Xml.Linq;
using SIL.XForge.Realtime.RichText;

namespace SIL.XForge.Scripture.Services
{
    public interface IDeltaUsxMapper
    {
        IReadOnlyDictionary<int, (Delta Delta, int LastVerse)> ToChapterDeltas(XElement usxElem);
        XElement ToUsx(XElement oldUsxElem, IEnumerable<Delta> chapterDeltas);
    }
}
