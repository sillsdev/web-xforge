using System;
using Newtonsoft.Json;

namespace SIL.XForge.Realtime;

/// <summary>
/// Converts an integer (representing a unix epoch) to a UTC DateTime.
/// </summary>
/// <remarks>
/// This is used for converting timestamps in ShareDB, which are an integer, into a .NET DateTime.
/// </remarks>
public class IntegerToUtcDateTimeConverter : JsonConverter
{
    /// <inheritdoc />
    public override bool CanConvert(Type objectType) => objectType == typeof(DateTime);

    /// <inheritdoc />
    public override object ReadJson(
        JsonReader reader,
        Type objectType,
        object? existingValue,
        JsonSerializer serializer
    ) =>
        long.TryParse(reader.Value?.ToString(), out long milliseconds)
            ? DateTimeOffset.FromUnixTimeMilliseconds(milliseconds).UtcDateTime
            : DateTime.MinValue;

    /// <inheritdoc />
    /// <exception cref="NotImplementedException">This method is not supported.</exception>
    public override void WriteJson(JsonWriter writer, object value, JsonSerializer serializer) =>
        throw new NotImplementedException();
}
