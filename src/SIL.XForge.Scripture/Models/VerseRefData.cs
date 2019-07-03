using SIL.Scripture;

namespace SIL.XForge.Scripture.Models
{
    public class VerseRefData
    {
        public VerseRefData()
        {
        }

        public VerseRefData(string book, string chapter, string verse, string versification = null)
        {
            Book = book;
            Chapter = chapter;
            Verse = verse;
            Versification = versification;
        }

        public string Book { get; set; }
        public string Chapter { get; set; }
        public string Verse { get; set; }
        public string Versification { get; set; }

        public VerseRef ToVerseRef()
        {
            return new VerseRef(Book, Chapter, Verse,
                Versification == null ? ScrVers.English : new ScrVers(Versification));
        }

        public override string ToString()
        {
            return ToVerseRef().ToString();
        }
    }
}
