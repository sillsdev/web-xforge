using System.Collections.Generic;
using Newtonsoft.Json;

namespace SIL.XForge.Realtime.Json0;

/// <summary>
/// This class represents an OT operation on arbitrary JSON data.
/// </summary>
[JsonObject(ItemNullValueHandling = NullValueHandling.Ignore)]
public class Json0Op
{
    [JsonProperty("p")]
    public List<object> Path { get; set; } = new List<object>();

    [JsonProperty("li")]
    public object InsertItem { get; set; }

    [JsonProperty("ld")]
    public object DeleteItem { get; set; }

    [JsonProperty("lm")]
    public int? MoveIndex { get; set; }

    [JsonProperty("oi")]
    public object InsertProp { get; set; }

    [JsonProperty("od")]
    public object DeleteProp { get; set; }

    [JsonProperty("na")]
    public int? Add { get; set; }
}
