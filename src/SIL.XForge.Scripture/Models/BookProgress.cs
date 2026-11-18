using System;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// Represents the translation progress for a single book, counted in verse units. A verse unit corresponds to one verse
/// marker in the text (so a verse range such as "11-12" is one unit), and is considered translated if any of its
/// segments contain content. See <see cref="Services.TextProgressService"/>.
///
/// The counts come from two sources that need not agree. <see cref="Verses"/> and <see cref="BlankVerses"/> are
/// counted from the text, where a verse range is one unit. <see cref="ExpectedVerses"/> comes from the project's
/// versification. So a chapter can hold more or fewer verse units than the versification expects, and a chapter the
/// project does not have adds to the book's <see cref="ExpectedVerses"/> but has no entry in <see cref="Chapters"/>.
/// The server reports the counts from the text and from the versification without reconciling them, and the client
/// combines them in bookTotalVerses (progress.service.ts). A book the versification does not describe has no expected
/// count and is measured by its verse units alone.
/// </summary>
public class BookProgress
{
    /// <summary>
    /// The book identifier (e.g. "GEN", "MAT").
    /// </summary>
    public string BookId { get; set; } = string.Empty;

    /// <summary>
    /// The number of verse units in this book (one per verse marker, so a verse range such as "11-12" is one unit).
    /// </summary>
    public int Verses { get; set; }

    /// <summary>
    /// The number of verse units in this book with no content in any of their segments.
    /// </summary>
    public int BlankVerses { get; set; }

    /// <summary>
    /// The number of verses the project's versification expects in the whole book, including chapters the project does
    /// not have, or <c>null</c> for a book the versification does not describe (e.g. a non-canonical book such as front
    /// matter or a glossary).
    /// </summary>
    public int? ExpectedVerses { get; set; }

    /// <summary>
    /// The progress data for each chapter in this book.
    /// </summary>
    public ChapterProgress[] Chapters { get; set; } = [];

    /// <summary>
    /// The name <see cref="Verses"/> had when progress was counted in segments. Frontend clients loaded before the
    /// rename still read this name.
    /// </summary>
    [Obsolete("For backwards compatibility with older frontend clients. Deprecated November 2026.")]
    public int VerseSegments => Verses;

    /// <summary>
    /// The name <see cref="BlankVerses"/> had when progress was counted in segments. Frontend clients loaded before
    /// the rename still read this name.
    /// </summary>
    [Obsolete("For backwards compatibility with older frontend clients. Deprecated November 2026.")]
    public int BlankVerseSegments => BlankVerses;
}

/// <summary>
/// A single chapter's translation-progress counts within a <see cref="BookProgress"/>, so clients can make
/// chapter-level decisions (e.g. which chapters to offer for partial drafting).
/// </summary>
public class ChapterProgress
{
    public int ChapterNumber { get; set; }

    /// <summary>
    /// The number of verse units in this chapter (one per verse marker, so a verse range such as "11-12" is one unit).
    /// </summary>
    public int Verses { get; set; }

    /// <summary>
    /// The number of verse units in this chapter with no content in any of their segments.
    /// </summary>
    public int BlankVerses { get; set; }

    /// <summary>
    /// The number of verses the project's versification expects in this chapter. Zero if the versification has no such
    /// chapter, which is always the case for a non-canonical book such as front matter or a glossary (see
    /// <see cref="BookProgress.ExpectedVerses"/>).
    /// </summary>
    public int ExpectedVerses { get; set; }

    /// <summary>
    /// The name <see cref="Verses"/> had when progress was counted in segments. Frontend clients loaded before the
    /// rename still read this name.
    /// </summary>
    [Obsolete("For backwards compatibility with older frontend clients. Deprecated November 2026.")]
    public int VerseSegments => Verses;

    /// <summary>
    /// The name <see cref="BlankVerses"/> had when progress was counted in segments. Frontend clients loaded before
    /// the rename still read this name.
    /// </summary>
    [Obsolete("For backwards compatibility with older frontend clients. Deprecated November 2026.")]
    public int BlankVerseSegments => BlankVerses;
}
