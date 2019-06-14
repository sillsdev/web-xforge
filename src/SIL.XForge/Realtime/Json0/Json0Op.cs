using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;

namespace SIL.XForge.Realtime.Json0
{
    /// <summary>
    /// This class represents an OT operation on arbitrary JSON data.
    /// </summary>
    [JsonObject(ItemNullValueHandling = NullValueHandling.Ignore)]
    public class Json0Op
    {
        public static Json0Op ListInsert(object item, params object[] path)
        {
            return new Json0Op { Path = path.ToList(), InsertItem = item };
        }

        public static Json0Op ListDelete(object item, params object[] path)
        {
            return new Json0Op { Path = path.ToList(), DeleteItem = item };
        }

        public static Json0Op ListReplace(object oldItem, object newItem, params object[] path)
        {
            return new Json0Op { Path = path.ToList(), DeleteItem = oldItem, InsertItem = newItem };
        }

        public static Json0Op ObjectInsert(object value, params object[] path)
        {
            return new Json0Op { Path = path.ToList(), InsertProp = value };
        }

        public static Json0Op ObjectDelete(object value, params object[] path)
        {
            return new Json0Op { Path = path.ToList(), DeleteProp = value };
        }

        public static Json0Op ObjectReplace(object oldValue, object newValue, params object[] path)
        {
            return new Json0Op { Path = path.ToList(), DeleteProp = oldValue, InsertProp = newValue };
        }

        public List<object> Path { get; set; } = new List<object>();

        [JsonProperty("li")]
        public object InsertItem { get; set; }

        [JsonProperty("ld")]
        public object DeleteItem { get; set; }

        [JsonProperty("lm")]
        public int MoveIndex { get; set; }

        [JsonProperty("oi")]
        public object InsertProp { get; set; }

        [JsonProperty("od")]
        public object DeleteProp { get; set; }
    }
}
