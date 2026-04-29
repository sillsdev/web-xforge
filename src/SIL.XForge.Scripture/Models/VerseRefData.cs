using SIL.Scripture;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// A verse reference that can be stored in Mongo or the RealtimeServer.
/// </summary>
public class VerseRefData()
{
    /// <summary>
    /// Initializes a new instance of the <see cref="VerseRefData"/> class with a verse as a number.
    /// </summary>
    /// <param name="bookNum">The book number.</param>
    /// <param name="chapterNum">The chapter number.</param>
    /// <param name="verseNum">The verse number.</param>
    /// <remarks>This should only be used when you want <see cref="Verse"/> to by <c>null</c>.</remarks>
    public VerseRefData(int bookNum, int chapterNum, int verseNum)
        : this()
    {
        BookNum = bookNum;
        ChapterNum = chapterNum;
        VerseNum = verseNum;
    }

    /// <summary>
    /// Initializes a new instance of the <see cref="VerseRefData"/> class.
    /// </summary>
    /// <param name="bookNum">The book number.</param>
    /// <param name="chapterNum">The chapter number.</param>
    /// <param name="verse">The verse.</param>
    public VerseRefData(int bookNum, int chapterNum, string verse)
        : this()
    {
        BookNum = bookNum;
        ChapterNum = chapterNum;
        Verse = verse;
        VerseNum = ParseVerseNumber(verse);
    }

    /// <summary>
    /// Gets or sets the book number.
    /// </summary>
    public int BookNum { get; set; }

    /// <summary>
    /// Gets or sets the chapter number.
    /// </summary>
    public int ChapterNum { get; set; }

    /// <summary>
    /// Gets or sets the verse number.
    /// </summary>
    public int VerseNum { get; set; }

    /// <summary>
    /// Gets or sets the verse.
    /// </summary>
    /// <remarks>If <c>null</c>, the <see cref="VerseNum"/> should be used instead.</remarks>
    public string? Verse { get; set; }

    public VerseRef ToVerseRef()
    {
        var verseRef = new VerseRef(BookNum, ChapterNum, VerseNum, VerseRef.defaultVersification);
        if (Verse != null)
            verseRef.Verse = Verse;
        return verseRef;
    }

    public override string ToString() => ToVerseRef().ToString();

    private static int ParseVerseNumber(string verse)
    {
        int i;
        for (i = 0; i < verse.Length && char.IsDigit(verse[i]); ++i) { }
        if (i > 0 && int.TryParse(verse[..i], out int number))
            return number;
        return 0;
    }
}
