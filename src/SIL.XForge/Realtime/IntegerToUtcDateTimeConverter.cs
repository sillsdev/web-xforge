using System;
using Newtonsoft.Json;

namespace SIL.XForge.Realtime;

public class IntegerToUtcDateTimeConverter : JsonConverter
{
    public override bool CanConvert(Type objectType) => objectType == typeof(DateTime);

    public override object ReadJson(
        JsonReader reader,
        Type objectType,
        object existingValue,
        JsonSerializer serializer
    ) =>
        long.TryParse(reader.Value?.ToString(), out long milliseconds)
            ? DateTimeOffset.FromUnixTimeMilliseconds(milliseconds).UtcDateTime
            : DateTime.MinValue;

    public override void WriteJson(JsonWriter writer, object value, JsonSerializer serializer) =>
        throw new NotImplementedException();
}
