namespace SIL.XForge.Scripture.Models;

/// <summary>
/// The details of a corpus file stored in Serval.
/// </summary>
public class ServalCorpusFile
{
    /// <summary>
    /// Gets or sets the corpus this file is associated with.
    /// </summary>
    public string CorpusId { get; set; } = string.Empty;

    /// <summary>
    /// The MD5 Hash of the corpus file's contents.
    /// This is used to see if the file has changed since its last upload to Serval.
    /// </summary>
    public string FileChecksum { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the file identifier used on Serval for this file.
    /// </summary>
    public string FileId { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the language of the file and corpus.
    /// </summary>
    public string LanguageCode { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the project this file is from. For example, the mixed source project.
    /// </summary>
    public string ProjectId { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the text identifier this file represents.
    /// </summary>
    /// <remarks>
    /// Notes:
    ///  - For text files, this will be in format bookNum_chapterNum.
    ///  - For Paratext files, this will be the target project id.
    ///  - When using mixed sources, TextId must be the same for each file to mix the sources together.
    /// </remarks>
    public string TextId { get; set; } = string.Empty;
}
