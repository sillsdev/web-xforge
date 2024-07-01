using System;
using Newtonsoft.Json;

namespace SIL.XForge.Realtime;

public class OpMetadata
{
    [JsonProperty("source")]
    public string? Source { get; set; }

    [JsonProperty("ts")]
    [JsonConverter(typeof(IntegerToUtcDateTimeConverter))]
    public DateTime Timestamp { get; set; }

    [JsonProperty("uId")]
    public string? UserId { get; set; }
}
