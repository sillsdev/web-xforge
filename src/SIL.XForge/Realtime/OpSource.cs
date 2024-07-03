using Newtonsoft.Json;
using Newtonsoft.Json.Converters;

namespace SIL.XForge.Realtime;

/// <summary>
/// The <see cref="Op"/> Source, stored in the <see cref="OpMetadata"/>.
/// </summary>
/// <remarks>These are stored as strings in MongoDB, and are only used by text documents.</remarks>
[JsonConverter(typeof(StringEnumConverter))]
public enum OpSource
{
    Editor,
    History,
    Draft,
    Paratext,
}
