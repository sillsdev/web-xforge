using Newtonsoft.Json;
using Newtonsoft.Json.Converters;

namespace SIL.XForge.Scripture.Models;

[JsonConverter(typeof(StringEnumConverter))]
public enum DocumentRevisionSource
{
    Editor,
    History,
    Draft,
    Paratext,
}
