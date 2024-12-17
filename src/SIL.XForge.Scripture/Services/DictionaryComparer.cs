using System;
using System.Collections.Generic;
using System.Linq;

namespace SIL.XForge.Scripture.Services;

public class DictionaryComparer<TKey, TValue> : IEqualityComparer<Dictionary<TKey, TValue>>
{
    public bool Equals(Dictionary<TKey, TValue>? x, Dictionary<TKey, TValue>? y) =>
        (x ?? []).OrderBy(p => p.Key).SequenceEqual((y ?? []).OrderBy(p => p.Key));

    public int GetHashCode(Dictionary<TKey, TValue>? obj)
    {
        HashCode hashCode = new HashCode();
        if (obj is null)
        {
            return hashCode.ToHashCode();
        }

        foreach (KeyValuePair<TKey, TValue> element in obj.OrderBy(p => p.Key))
        {
            hashCode.Add(element.Key);
            hashCode.Add(element.Value);
        }

        return hashCode.ToHashCode();
    }
}
