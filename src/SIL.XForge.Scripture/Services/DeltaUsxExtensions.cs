using Newtonsoft.Json.Linq;
using SIL.XForge.Realtime.RichText;

namespace SIL.XForge.Scripture.Services;

public static class DeltaUsxExtensions
{
    public static Delta InsertPara(this Delta delta, JObject paraAttributes, JObject? attributes = null)
    {
        attributes = (JObject)attributes?.DeepClone() ?? [];
        attributes.Add(new JProperty("para", paraAttributes));
        return delta.Insert("\n", attributes);
    }

    public static Delta InsertText(this Delta delta, string text, string? segRef = null, JObject? attributes = null) =>
        delta.Insert(text, attributes);

    public static Delta InsertEmpty(this Delta delta, string segRef, JObject? attributes = null) =>
        delta.Insert(new { empty = true }, attributes);

    public static Delta InsertEmbed(
        this Delta delta,
        string type,
        JObject obj,
        string? segRef = null,
        JObject? attributes = null
    ) => delta.Insert(new JObject(new JProperty(type, obj)), attributes);
}
