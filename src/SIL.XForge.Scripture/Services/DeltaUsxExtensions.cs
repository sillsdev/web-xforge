using Newtonsoft.Json.Linq;
using SIL.XForge.Realtime.RichText;

namespace SIL.XForge.Scripture.Services
{
    public static class DeltaUsxExtensions
    {
        public static Delta InsertPara(this Delta delta, JObject paraAttributes, JObject attributes = null)
        {
            attributes = (JObject) attributes?.DeepClone() ?? new JObject();
            attributes.Add(new JProperty("para", paraAttributes));
            return delta.Insert("\n", attributes);
        }

        public static Delta InsertText(this Delta delta, string text, string segRef = null, JObject attributes = null)
        {
            if (segRef != null)
            {
                attributes = (JObject) attributes?.DeepClone() ?? new JObject();
                attributes.Add(new JProperty("segment", segRef));
            }
            return delta.Insert(text, attributes);
        }

        public static Delta InsertBlank(this Delta delta, string segRef)
        {
            var attrs = new JObject(new JProperty("segment", segRef));
            return delta.Insert(new { blank = true }, attrs);
        }

        public static Delta
        InsertEmbed(this Delta delta, string type, JObject obj, string segRef = null, JObject attributes = null)
        {
            var embed = new JObject(new JProperty(type, obj));

            if (segRef != null)
            {
                attributes = (JObject) attributes?.DeepClone() ?? new JObject();
                attributes.Add(new JProperty("segment", segRef));
            }

            return delta.Insert(embed, attributes);
        }
    }
}
