namespace SIL.XForge.Scripture.Models;

/// <summary>
/// Represents the translation progress for a single book, counted in verse units.
/// A verse unit corresponds to one verse marker in the text (so a verse range such as "11-12" is one unit),
/// and is translated if any of its segments contain content. See <see cref="Services.TextProgressService"/>.
/// </summary>
public class BookProgress
{
    /// <summary>
    /// The book identifier (e.g. "GEN", "MAT").
    /// </summary>
    public string BookId { get; set; } = string.Empty;

    /// <summary>
    /// The total number of verse units in this book (typically same as verse count, but ranges are counted as one).
    /// </summary>
    public int Verses { get; set; }

    /// <summary>
    /// The number of verse units in this book with no content in any of their segments.
    /// </summary>
    public int BlankVerses { get; set; }

    /// <summary>
    /// The number of verses the project's versification expects in the whole book. Unlike <see cref="Verses"/> this
    /// also covers chapters that do not exist in the project, so subtracting the expected verses of the chapters in
    /// <see cref="Chapters"/> gives the size of the missing chapters.
    /// </summary>
    public int ExpectedVerses { get; set; }

    /// <summary>
    /// The progress data for each chapter in this book.
    /// </summary>
    public ChapterProgress[] Chapters { get; set; } = [];
}

/// <summary>
/// A single chapter's translation-progress counts within a <see cref="BookProgress"/>, so clients can make
/// chapter-level decisions (e.g. which chapters to offer for partial drafting).
/// </summary>
public class ChapterProgress
{
    public int ChapterNumber { get; set; }

    /// <summary>
    /// The total number of verse units in this chapter.
    /// </summary>
    public int Verses { get; set; }

    /// <summary>
    /// The number of verse units in this chapter with no content in any of their segments.
    /// </summary>
    public int BlankVerses { get; set; }

    /// <summary>
    /// The number of verses the project's versification expects in this chapter, or zero for a chapter the
    /// versification does not have.
    /// </summary>
    public int ExpectedVerses { get; set; }
}
