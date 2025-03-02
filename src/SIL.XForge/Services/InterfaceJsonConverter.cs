using System;
using Newtonsoft.Json;

namespace SIL.XForge.Services;

/// <summary>
/// Allows interfaces to be converted to concrete types in JSON.NET via <see cref="JsonConverterAttribute"/>.
/// </summary>
/// <typeparam name="TI">The interface type.</typeparam>
/// <typeparam name="T">The concrete type.</typeparam>
public class InterfaceJsonConverter<TI, T> : JsonConverter<TI>
    where T : class, TI, new()
{
    public override TI? ReadJson(
        JsonReader reader,
        Type objectType,
        TI? existingValue,
        bool hasExistingValue,
        JsonSerializer serializer
    )
    {
        T concreteClass = new T();
        serializer.Populate(reader, concreteClass);
        return concreteClass;
    }

    public override void WriteJson(JsonWriter writer, TI? value, JsonSerializer serializer) =>
        throw new NotImplementedException();

    public override bool CanWrite => false;
}
