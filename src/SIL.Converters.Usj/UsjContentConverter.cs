using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace SIL.Converters.Usj
{
    /// <summary>
    /// Converts the contents of the Content <see cref="ICollection{T}"/>> to and from JSON, preserving
    /// the two supported content types: <see cref="string"/> and <see cref="UsjMarker"/>.
    /// </summary>
    public class UsjContentConverter : JsonConverter<ICollection<object>>
    {
        /// <inheritdoc />
        public override ICollection<object> ReadJson(
            JsonReader reader,
            Type objectType,
            ICollection<object> existingValue,
            bool hasExistingValue,
            JsonSerializer serializer
        )
        {
            var jArray = JArray.Load(reader);
            var list = new List<object>();

            foreach (JToken item in jArray)
            {
                if (item.Type == JTokenType.String)
                {
                    list.Add(item.ToString());
                }
                else
                {
                    var usjMarker = item.ToObject<UsjMarker>();
                    list.Add(usjMarker);
                }
            }

            return list;
        }

        /// <inheritdoc />
        public override void WriteJson(JsonWriter writer, ICollection<object> value, JsonSerializer serializer)
        {
            JArray jArray = new JArray();
            foreach (object item in value)
            {
                if (item is string str)
                {
                    jArray.Add(str);
                }
                else if (item is UsjMarker usjMarker)
                {
                    jArray.Add(JToken.FromObject(usjMarker));
                }
            }

            jArray.WriteTo(writer);
        }
    }
}
