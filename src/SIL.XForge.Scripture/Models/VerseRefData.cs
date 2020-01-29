using SIL.Scripture;

namespace SIL.XForge.Scripture.Models
{
    public class VerseRefData
    {
        private static void ParseVerseNumber(string vNum, out int number, out string segment)
        {
            int j;
            for (j = 0; j < vNum.Length && char.IsDigit(vNum[j]); ++j)
            {
            }

            number = 0;
            if (j > 0)
            {
                string num = vNum.Substring(0, j);
                int.TryParse(num, out number); // Can't fail, we have already validated digits
            }

            segment = vNum.Substring(j);
        }

        public VerseRefData()
        {
        }

        public VerseRefData(int bookNum, int chapterNum, int verseNum)
        {
            BookNum = bookNum;
            ChapterNum = chapterNum;
            VerseNum = verseNum;
        }

        public VerseRefData(int bookNum, int chapterNum, string verse)
        {
            BookNum = bookNum;
            ChapterNum = chapterNum;
            Verse = verse;
            ParseVerseNumber(verse, out int verseNum, out _);
            VerseNum = verseNum;
        }

        public int BookNum { get; set; }

        public int ChapterNum { get; set; }

        public int VerseNum { get; set; }

        public string Verse { get; set; }

        public VerseRef ToVerseRef()
        {
            var verseRef = new VerseRef(BookNum, ChapterNum, VerseNum, VerseRef.defaultVersification);
            if (Verse != null) verseRef.Verse = Verse;
            return verseRef;
        }

        public override string ToString()
        {
            return ToVerseRef().ToString();
        }
    }
}
