using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using SIL.XForge.Realtime.RichText;

namespace SIL.XForge.Scripture.Services;

public static class DeltaUsxExtensions
{
    public static Delta InsertPara(this Delta delta, JObject paraAttributes, JObject attributes = null)
    {
        attributes = (JObject)attributes?.DeepClone() ?? new JObject();
        attributes.Add(new JProperty("para", paraAttributes));
        return delta.Insert("\n", attributes);
    }

    public static Delta InsertText(this Delta delta, string text, string segRef = null, JObject attributes = null)
    {
        if (segRef != null)
        {
            attributes = (JObject)attributes?.DeepClone() ?? new JObject();
            attributes.Add(new JProperty("segment", segRef));
        }
        return delta.Insert(text, attributes);
    }

    public static Delta InsertBlank(this Delta delta, string segRef)
    {
        var attrs = new JObject(new JProperty("segment", segRef));
        return delta.Insert(new { blank = true }, attrs);
    }

    public static Delta InsertEmpty(this Delta delta, string segRef, JObject attributes = null)
    {
        attributes = (JObject)attributes?.DeepClone() ?? new JObject();
        attributes.Add(new JProperty("segment", segRef));
        return delta.Insert(new { empty = true }, attributes);
    }

    public static Delta InsertEmbed(
        this Delta delta,
        string type,
        JObject obj,
        string segRef = null,
        JObject attributes = null
    )
    {
        var embed = new JObject(new JProperty(type, obj));

        if (segRef != null)
        {
            attributes = (JObject)attributes?.DeepClone() ?? new JObject();
            attributes.Add(new JProperty("segment", segRef));
        }

        return delta.Insert(embed, attributes);
    }

    public static IEnumerable<string> InvalidTags(this Delta delta)
    {
        var invalidTags = new HashSet<string>();
        foreach (var op in delta.Ops.Where(t => t.OpType() == Delta.InsertType))
        {
            invalidTags.UnionWith(CheckToken(op));
        }

        return invalidTags;
    }

    private static List<string> CheckToken(JToken token)
    {
        var invalidTags = new List<string>();
        if (
            token.SelectToken("attributes.invalid-block") != null
            || token.SelectToken("attributes.invalid-inline") != null
        )
        {
            var style = token.SelectToken("attributes.*.style");
            if (style != null)
            {
                invalidTags.Add(style.Value<string>());
            }
        }

        foreach (var child in token.Children())
        {
            var childTags = CheckToken(child);
            invalidTags.AddRange(childTags);
        }

        return invalidTags;
    }
}
