using System;
using System.Runtime.Serialization;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;

namespace SIL.XForge.Realtime;

public class OpMetadata
{
    [JsonProperty("source")]
    public OpSource? Source { get; set; }

    [JsonProperty("ts")]
    [JsonConverter(typeof(IntegerToUtcDateTimeConverter))]
    public DateTime Timestamp { get; set; }

    [JsonProperty("uId")]
    public string? UserId { get; set; }

    /// <summary>
    /// Handles errors in serializing/deserializing this class.
    /// </summary>
    /// <param name="context">The context.</param>
    /// <param name="errorContext">The error context.</param>
    /// <remarks>This ignores errors, particularly when serializing/deserializing the source.</remarks>
    [OnError]
#pragma warning disable CA1822 // Members that do not access instance data or call instance methods can be marked static
    internal void OnError(StreamingContext context, ErrorContext errorContext) => errorContext.Handled = true;
#pragma warning restore CA1822
}
