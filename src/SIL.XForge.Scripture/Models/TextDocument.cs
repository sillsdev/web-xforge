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
