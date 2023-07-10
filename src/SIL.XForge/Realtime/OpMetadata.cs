using System;
using Newtonsoft.Json;

namespace SIL.XForge.Realtime;

public class OpMetadata
{
    [JsonProperty("ts")]
    [JsonConverter(typeof(IntegerToUtcDateTimeConverter))]
    public DateTime Timestamp { get; set; }
}
