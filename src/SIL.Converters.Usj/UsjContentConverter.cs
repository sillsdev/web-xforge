using System;
using System.Collections;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace SIL.Converters.Usj
{
    /// <summary>
    /// Converts the contents of the Content <see cref="ArrayList"/> to and from JSON, preserving
    /// the two supported content types: <see cref="string"/> and <see cref="UsjMarker"/>.
    /// </summary>
    public class UsjContentConverter : JsonConverter<ArrayList>
    {
        /// <inheritdoc />
        public override ArrayList ReadJson(
            JsonReader reader,
            Type objectType,
            ArrayList existingValue,
            bool hasExistingValue,
            JsonSerializer serializer
        )
        {
            var jArray = JArray.Load(reader);
            var list = new ArrayList();

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
        public override void WriteJson(JsonWriter writer, ArrayList value, JsonSerializer serializer)
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
