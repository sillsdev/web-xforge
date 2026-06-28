using System;
using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// The metrics for a specific draft.
/// </summary>
public class DraftMetrics : IIdentifiable
{
    /// <summary>
    /// Gets the document identifier for the draft metrics of a specific build.
    /// </summary>
    /// <param name="sfProjectId">The Scripture Forge project identifier.</param>
    /// <param name="buildId">The build identifier.</param>
    /// <returns>An id in the format <c>projectId:buildId</c>.</returns>
    public static string GetDocId(string sfProjectId, string buildId) => $"{sfProjectId}:{buildId}";

    /// <summary>
    /// Gets or sets the identifier.
    /// </summary>
    /// <remarks>This is in the format projectId:buildId.</remarks>
    public required string Id { get; set; }

    /// <summary>
    /// Gets or sets the confidence scores for every book in the draft.
    /// </summary>
    public List<BookConfidence> BookConfidences { get; set; } = [];

    /// <summary>
    /// Gets or sets the confidence scores for every chapter in the draft.
    /// </summary>
    public List<ChapterConfidence> ChapterConfidences { get; set; } = [];

    /// <summary>
    /// Gets or sets the quality estimation configuration for this draft.
    /// </summary>
    public required QualityEstimationConfig QualityEstimationConfig { get; set; }

    /// <summary>
    /// The confidence scores for every verse in the draft.
    /// </summary>
    public List<VerseConfidence> VerseConfidences { get; set; } = [];

    /// <summary>
    /// The date and time in UTC when these metrics were last updated.
    /// </summary>
    public DateTime DateUpdated { get; set; }
}

public class VerseConfidence : VerseRefData
{
    public VerseConfidence() { }

    public VerseConfidence(int bookNum, int chapterNum, int verseNum, double confidence)
        : base(bookNum, chapterNum, verseNum) => Confidence = confidence;

    public VerseConfidence(int bookNum, int chapterNum, string verse, double confidence)
        : base(bookNum, chapterNum, verse) => Confidence = confidence;

    public double Confidence { get; set; }
}

public class ConfidenceScore
{
    public required double Confidence { get; set; }
    public required string Label { get; set; }
    public required double ProjectedChrF3 { get; set; }
    public required double Usability { get; set; }
}

public class BookConfidence : ConfidenceScore
{
    public required int BookNum { get; set; }
}

public class ChapterConfidence : BookConfidence
{
    public required int ChapterNum { get; set; }
}

/// <summary>
/// The values that will be returned to the front end for build confidences.
/// </summary>
public class BuildConfidences
{
    /// <summary>
    /// Gets or sets the project identifier.
    /// </summary>
    public required string ProjectId { get; init; }

    /// <summary>
    /// Gets or sets the build identifier.
    /// </summary>
    public required string BuildId { get; init; }

    /// <summary>
    /// Gets or sets the confidence scores for every book in the build.
    /// </summary>
    public required ICollection<BookConfidence> BookConfidences { get; init; }

    /// <summary>
    /// Gets or sets the confidence scores for every chapter in the build.
    /// </summary>
    public required List<ChapterConfidence> ChapterConfidences { get; init; }

    /// <summary>
    /// Gets or sets the lowest confidence score.
    /// </summary>
    public ConfidenceScore? LowestConfidence { get; init; }
}
