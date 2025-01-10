using System;
using System.Text.Json;
using System.Text.Json.Serialization;
using MongoDB.Bson;

namespace SIL.XForge.DataAccess;

/// <summary>
/// The class converts BSON to and from JSON for use with RPC controllers.
/// </summary>
/// <remarks>
/// This is exclusively for use with EdjCase.JsonRpc, as all other JSON serialization in SF uses Newtonsoft Json.NET.
/// </remarks>
public class BsonValueConverter : JsonConverter<BsonValue>
{
    public override BsonValue Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        // Handle arrays
        if (reader.TokenType == JsonTokenType.StartArray)
        {
            var bsonArray = new BsonArray();
            while (reader.Read() && reader.TokenType != JsonTokenType.EndArray)
            {
                bsonArray.Add(Read(ref reader, typeof(BsonValue), options));
            }

            return bsonArray;
        }

        // Handle objects
        if (reader.TokenType == JsonTokenType.StartObject)
        {
            var bsonDocument = new BsonDocument();

            while (reader.Read() && reader.TokenType != JsonTokenType.EndObject)
            {
                if (reader.TokenType == JsonTokenType.PropertyName)
                {
                    string propertyName = reader.GetString();
                    reader.Read();

                    // Recursively deserialize the value
                    var value = Read(ref reader, typeof(BsonValue), options);
                    bsonDocument[propertyName] = value;
                }
            }

            return bsonDocument;
        }

        // Handle individual value types
        return reader.TokenType switch
        {
            JsonTokenType.String when reader.TryGetDateTime(out DateTime dateTime) => BsonDateTime.Create(dateTime),
            JsonTokenType.String => BsonString.Create(reader.GetString()),
            JsonTokenType.Number when reader.TryGetInt32(out int intValue) => BsonInt32.Create(intValue),
            JsonTokenType.Number when reader.TryGetInt64(out long longValue) => BsonInt64.Create(longValue),
            JsonTokenType.Number => BsonDouble.Create(reader.GetDouble()), // Parse float and decimal as double
            JsonTokenType.True => BsonBoolean.True,
            JsonTokenType.False => BsonBoolean.False,
            JsonTokenType.Null => BsonNull.Value,
            _ => throw new JsonException($"Unsupported JsonTokenType: {reader.TokenType}"),
        };
    }

    public override void Write(Utf8JsonWriter writer, BsonValue value, JsonSerializerOptions options)
    {
        if (value.IsBsonArray)
        {
            // Write BsonArray as a JSON array
            writer.WriteStartArray();
            foreach (var item in (BsonArray)value)
            {
                Write(writer, item, options);
            }

            writer.WriteEndArray();
        }
        else if (value.IsBsonDocument)
        {
            // Write BsonDocument as a JSON object
            writer.WriteStartObject();
            foreach (var element in (BsonDocument)value)
            {
                writer.WritePropertyName(element.Name);
                Write(writer, element.Value, options);
            }

            writer.WriteEndObject();
        }
        else if (value.IsBsonNull)
        {
            // Write null value
            writer.WriteNullValue();
        }
        else
        {
            // Write primitive values
            switch (value.BsonType)
            {
                case BsonType.String:
                    writer.WriteStringValue(value.AsString);
                    break;
                case BsonType.Int32:
                    writer.WriteNumberValue(value.AsInt32);
                    break;
                case BsonType.Int64:
                    writer.WriteNumberValue(value.AsInt64);
                    break;
                case BsonType.Double: // This includes float
                    writer.WriteNumberValue(value.AsDouble);
                    break;
                case BsonType.Decimal128:
                    writer.WriteNumberValue((decimal)value.AsDecimal128);
                    break;
                case BsonType.Boolean:
                    writer.WriteBooleanValue(value.AsBoolean);
                    break;
                case BsonType.DateTime:
                    // Serialize as ISO 8601 string
                    writer.WriteStringValue(value.ToUniversalTime().ToString("o"));
                    break;
                default:
                    throw new JsonException($"Unsupported BsonType: {value.BsonType}");
            }
        }
    }
}
