using System.Collections;
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

    public static string GetDocId(string projectId, int book, int chapter, string textType = Target) =>
        $"{projectId}:{Canon.BookNumberToId(book)}:{chapter}:{textType}";

    /// <summary>
    /// The JSON representation of scripture contents from USFM/USX.
    /// </summary>
    /// <value>This will either be a <see cref="UsjMarker"/> or <see cref="string"/>.</value>
    [JsonConverter(typeof(UsjContentConverter))]
    public ArrayList? Content { get; set; }

    /// <summary>
    /// The USJ spec type.
    /// </summary>
    public string Type { get; set; } = Usj.UsjType;

    /// <summary>
    /// The USJ spec version.
    /// </summary>
    public string Version { get; set; } = Usj.UsjVersion;
}
