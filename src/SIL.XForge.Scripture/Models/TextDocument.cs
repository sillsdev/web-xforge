using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using Newtonsoft.Json;
using SIL.Converters.Usj;
using SIL.Scripture;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models;

public class TextDocument : Json0Snapshot, IUsj
{
    /// <summary>
    /// The draft text type.
    /// </summary>
    public const string Draft = "draft";

    /// <summary>
    /// The target text type.
    /// </summary>
    public const string Target = "target";

    /// <summary>
    /// Initializes a new instance of the <see cref="TextDocument"/> class.
    /// </summary>
    public TextDocument() { }

    /// <summary>
    /// Initializes a new instance of the <see cref="TextDocument"/> class from a <see cref="IUsj"/> interface.
    /// </summary>
    /// <param name="id">The text document identifier.</param>
    /// <param name="usj">The USJ.</param>
    public TextDocument(string id, IUsj usj)
    {
        Id = id;
        Content = usj.Content;
        Type = usj.Type;
        Version = usj.Version;
    }

    public static string GetDocId(string projectId, int book, int chapter, string textType) =>
        $"{projectId}:{Canon.BookNumberToId(book)}:{chapter}:{textType}";

    /// <summary>
    /// Parses a text document identifier created by <see cref="GetDocId"/>.
    /// </summary>
    /// <param name="docId">The text document identifier.</param>
    /// <param name="projectId">The project identifier.</param>
    /// <param name="bookId">The USFM book identifier, e.g. GEN.</param>
    /// <param name="chapter">The chapter number.</param>
    /// <param name="textType">The text type, i.e. <see cref="Draft"/> or <see cref="Target"/>.</param>
    /// <returns><c>true</c> if the identifier was in the expected format; otherwise, <c>false</c>.</returns>
    public static bool TryParseDocId(
        string docId,
        [NotNullWhen(true)] out string? projectId,
        [NotNullWhen(true)] out string? bookId,
        out int chapter,
        [NotNullWhen(true)] out string? textType
    )
    {
        projectId = null;
        bookId = null;
        chapter = 0;
        textType = null;

        string[] parts = docId.Split(':');
        if (
            parts.Length != 4
            || Canon.BookIdToNumber(parts[1]) <= 0
            || !int.TryParse(parts[2], out int chapterNum)
            || chapterNum <= 0
        )
        {
            return false;
        }

        projectId = parts[0];
        bookId = parts[1];
        chapter = chapterNum;
        textType = parts[3];
        return true;
    }

    /// <summary>
    /// The JSON representation of scripture contents from USFM/USX.
    /// </summary>
    /// <value>This will either be a <see cref="UsjMarker"/> or <see cref="string"/>.</value>
    [JsonConverter(typeof(UsjContentConverter))]
    public ICollection<object>? Content { get; set; }

    /// <summary>
    /// The USJ spec type.
    /// </summary>
    public string Type { get; set; } = Usj.UsjType;

    /// <summary>
    /// The USJ spec version.
    /// </summary>
    public string Version { get; set; } = Usj.UsjVersion;
}
